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
import { createAndDeliverWebhook } from "./webhook.service";
import { eventBus, AppEvents } from "./EventService";

const prisma = new PrismaClient();

const LOCK_NAME = "payment_expiry";
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches default cron interval

async function acquireLock(lockedBy: string): Promise<boolean> {
  const now = new Date();
  try {
    await prisma.cronLock.upsert({
      where: { job_name: LOCK_NAME },
      create: {
        job_name: LOCK_NAME,
        locked_at: now,
        expires_at: new Date(now.getTime() + LOCK_TTL_MS),
        locked_by: lockedBy,
      },
      update: {
        // Only take the lock if the existing one has expired
        locked_at: now,
        expires_at: new Date(now.getTime() + LOCK_TTL_MS),
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

  const acquired = await acquireLock(lockedBy);
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
        status: "pending",
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
        where: { id: payment.id, status: "pending" },
        data: { status: "expired" },
      });

      if (updated.count === 0) {
        // Already transitioned by a concurrent run — skip webhook
        continue;
      }

      result.expired++;

      // Emit internal event (for any in-process listeners)
      eventBus.emit(AppEvents.PAYMENT_EXPIRED, { ...payment, status: "expired" });

      // Fire webhook — stable event_id ensures idempotent delivery
      const eventId = `${payment.id}:expired`;
      try {
        await createAndDeliverWebhook(
          payment.merchantId,
          "payment_failed",          // product spec: use payment_failed event type
          {
            event: "payment.expired",
            data: {
              payment_id: payment.id,
              amount: payment.amount.toString(),
              currency: payment.currency,
              status: "expired",
              customer_email: payment.customer_email,
              expired_at: now.toISOString(),
              reason: "Payment window expired without on-chain confirmation.",
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
