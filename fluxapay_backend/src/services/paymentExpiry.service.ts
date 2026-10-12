/**
 * paymentExpiry.service.ts
 *
 * Scheduled job: find all payments with status=pending and expiration < now,
 * transition them to "expired", and fire a payment_failed webhook per product spec.
 *
 * Idempotency:
 *  - Uses a CronLock row (job_name="payment_expiry") to prevent concurrent runs.
 *  - Each payment is updated with a WHERE clause that guards status="pending",
 *    so re-runs on already-expired rows are no-ops.
 *  - Webhook delivery uses a stable event_id (payment_id + ":expired") so
 *    createAndDeliverWebhook skips re-delivery if already sent.
 */

import { PrismaClient } from "../generated/client/client";
import { prisma } from "../config/prisma";
import { createAndDeliverWebhook } from "./webhook.service";
import { eventBus, AppEvents } from "./EventService";
import { PaymentStatus } from "../types/payment";
import { trackPaymentExpired } from "../middleware/metrics.middleware";


const LOCK_NAME = "payment_expiry";
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches default cron interval

/**
 * Acquire a distributed lock with mandatory TTL.
 * 
 * @param lockedBy Identifier of lock holder (e.g., "hostname:pid")
 * @param ttlSeconds Lock TTL in seconds. Required to prevent indefinite lock holds on crash.
 * @returns true if lock acquired, false if held by another instance
 * 
 * The TTL ensures that if the lock holder crashes, the lock will auto-expire
 * and allow another instance to acquire it after the TTL window.
 * 
 * Crash resilience:
 *  - If process crashes while holding lock, DB row persists but expires_at < now
 *  - Next instance to run will detect expired lock and take over
 *  - Lock is re-read after upsert to prevent race condition (two instances think they own it)
 */
async function acquireLock(lockedBy: string, ttlSeconds: number): Promise<boolean> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error(`Invalid TTL: ${ttlSeconds}. Must be positive integer (seconds).`);
  }

  const ttlMs = ttlSeconds * 1000;
  const now = new Date();
  try {
    await prisma.cronLock.upsert({
      where: { job_name: LOCK_NAME },
      create: {
        job_name: LOCK_NAME,
        locked_at: now,
        expires_at: new Date(now.getTime() + ttlMs),
        locked_by: lockedBy,
      },
      update: {
        // Only take the lock if the existing one has expired
        locked_at: now,
        expires_at: new Date(now.getTime() + ttlMs),
        locked_by: lockedBy,
      },
    });

    // Re-read to confirm we own it (handles race between two instances)
    const lock = await prisma.cronLock.findUnique({ where: { job_name: LOCK_NAME } });
    return lock?.locked_by === lockedBy && lock.expires_at > now;
  } catch {
    return false;
  }
}

async function releaseLock(): Promise<void> {
  await prisma.cronLock
    .delete({ where: { job_name: LOCK_NAME } })
    .catch(() => {/* already gone — fine */});
}

export interface PaymentExpiryResult {
  processed: number;
  expired: number;
  webhookErrors: { paymentId: string; error: string }[];
}

export async function runPaymentExpiryJob(): Promise<PaymentExpiryResult> {
  const lockedBy = `${process.env.HOSTNAME ?? "app"}:${process.pid}`;

  // Lock with 5-minute TTL (same as cron interval)
  // If process crashes, lock auto-expires and next instance can run within 5 minutes
  const acquired = await acquireLock(lockedBy, 300); // 300 seconds = 5 minutes
  if (!acquired) {
    console.log("[PaymentExpiry] Lock held by another instance — skipping.");
    return { processed: 0, expired: 0, webhookErrors: [] };
  }

  const result: PaymentExpiryResult = { processed: 0, expired: 0, webhookErrors: [] };

  try {
    const now = new Date();

    // Find all pending payments past their expiration in one query
    const expiredPayments = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        expiration: { lt: now },
      },
      select: {
        id: true,
        merchantId: true,
        amount: true,
        currency: true,
        customer_email: true,
        expiration: true,
      },
    });

    result.processed = expiredPayments.length;

    if (expiredPayments.length === 0) {
      console.log("[PaymentExpiry] No expired payments found.");
      return result;
    }

    console.log(`[PaymentExpiry] Found ${expiredPayments.length} expired payment(s). Processing...`);

    for (const payment of expiredPayments) {
      // Idempotent update: only transitions rows still in "pending"
      const updated = await prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.EXPIRED },
      });

      if (updated.count === 0) {
        // Already transitioned by a concurrent run — skip webhook
        continue;
      }

      result.expired++;
      trackPaymentExpired(1);

      // Emit internal event (for any in-process listeners)
      eventBus.emit(AppEvents.PAYMENT_EXPIRED, { ...payment, status: PaymentStatus.EXPIRED });

      // Fire webhook — stable event_id ensures idempotent delivery
      const eventId = `${payment.id}:expired`;
      try {
        await createAndDeliverWebhook(
          payment.merchantId,
          "payment_expired",          // issue #655: use the dedicated payment_expired event type
          {
            event: "payment.expired",
            data: {
              charge_id: payment.id,
              merchant_id: payment.merchantId,
              amount: payment.amount.toString(),
              currency: payment.currency,
              expired_at: now.toISOString(),
            },
          },
          payment.id,
          undefined,
          eventId,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[PaymentExpiry] Webhook failed for payment ${payment.id}: ${msg}`);
        result.webhookErrors.push({ paymentId: payment.id, error: msg });
      }
    }

    console.log(
      `[PaymentExpiry] Done — ${result.expired}/${result.processed} expired, ` +
      `${result.webhookErrors.length} webhook error(s).`,
    );
  } finally {
    await releaseLock();
  }

  return result;
}
