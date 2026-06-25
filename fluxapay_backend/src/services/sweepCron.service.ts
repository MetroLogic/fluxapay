/**
 * sweepCron.service.ts
 *
 * Wraps sweepService.sweepPaidPayments with:
 *  - DB-level lease lock (CronLock table) to prevent concurrent runs
 *  - Structured audit log + metrics on every execution
 *
 * Lock strategy:
 *  1. Attempt to INSERT/UPDATE the CronLock row only when it is absent or expired.
 *  2. If another instance holds a non-expired lock, skip this tick and log a warning.
 *  3. On completion (success or error), release the lock immediately.
 */

import os from "os";
import { PrismaClient } from "../generated/client/client";
import { sweepService } from "./sweep.service";
import { logSweepTrigger, updateSweepCompletion } from "./audit.service";

const prisma = new PrismaClient();

// Lock TTL: slightly longer than the cron interval so a crashed process
// doesn't block the next tick forever. Configurable via env.
const LOCK_TTL_MS = parseInt(process.env.SWEEP_LOCK_TTL_MS ?? "600000", 10); // 10 min default
const LOCK_OWNER = `${os.hostname()}:${process.pid}`;
const JOB_NAME = "sweep";

const metrics = {
  increment: (name: string, tags?: Record<string, string | number>) =>
    console.log(JSON.stringify({ metric: name, ...tags })),
  gauge: (name: string, value: number, tags?: Record<string, string | number>) =>
    console.log(JSON.stringify({ metric: name, value, ...tags })),
};

/**
 * Try to acquire the DB lease. Returns true if acquired, false if already held.
 */
async function acquireLock(): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  // Use a raw upsert that only succeeds when the row is absent OR expired.
  // Prisma doesn't support conditional upserts natively, so we use $executeRaw.
  const updated = await prisma.$executeRaw`
    INSERT INTO "CronLock" (job_name, locked_at, expires_at, locked_by)
    VALUES (${JOB_NAME}, ${now}, ${expiresAt}, ${LOCK_OWNER})
    ON CONFLICT (job_name) DO UPDATE
      SET locked_at  = ${now},
          expires_at = ${expiresAt},
          locked_by  = ${LOCK_OWNER}
      WHERE "CronLock".expires_at < ${now}
  `;

  // executeRaw returns the number of rows affected (1 = acquired, 0 = not acquired)
  return updated === 1;
}

async function releaseLock(): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "CronLock"
    WHERE job_name = ${JOB_NAME} AND locked_by = ${LOCK_OWNER}
  `;
}

/**
 * Run one sweep tick with idempotency locking, audit logging, and metrics.
 * Safe to call from any cron scheduler.
 */
export async function runSweepWithLock(): Promise<void> {
  const acquired = await acquireLock();

  if (!acquired) {
    console.warn(`[SweepCron] Lock held by another instance – skipping tick.`);
    metrics.increment("sweep_cron_skipped", { reason: "lock_held" });
    return;
  }

  const startMs = Date.now();
  const auditLog = await logSweepTrigger({
    adminId: "system",
    sweepType: "scheduled",
    reason: "Periodic cron sweep",
  });

  try {
    const result = await sweepService.sweepPaidPayments({ adminId: "system" });

    const durationMs = Date.now() - startMs;

    console.log(
      JSON.stringify({
        level: "info",
        message: "Sweep completed",
        sweepId: result.sweepId,
        addressesSwept: result.addressesSwept,
        totalAmount: result.totalAmount,
        skipped: result.skipped.length,
        durationMs,
      }),
    );

    metrics.increment("sweep_cron_success");
    metrics.gauge("sweep_addresses_swept", result.addressesSwept);
    metrics.gauge("sweep_total_usdc", parseFloat(result.totalAmount));
    metrics.gauge("sweep_duration_ms", durationMs);

    if (auditLog) {
      await updateSweepCompletion({
        auditLogId: auditLog.id,
        status: "completed",
        statistics: {
          addresses_swept: result.addressesSwept,
          total_amount: result.totalAmount,
          transaction_hash: result.txHashes[0],
        },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startMs;

    console.error(
      JSON.stringify({
        level: "error",
        message: "Sweep failed",
        error: msg,
        durationMs,
      }),
    );

    metrics.increment("sweep_cron_error", { error: msg });

    if (auditLog) {
      await updateSweepCompletion({
        auditLogId: auditLog.id,
        status: "failed",
        failureReason: msg,
      });
    }
  } finally {
    await releaseLock();
  }
}
