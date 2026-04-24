/**
 * paymentExpiryReminder.service.ts
 *
 * Scheduled job: find pending payments whose expiration falls within the
 * configurable reminder window and notify the merchant via webhook and/or email.
 *
 * Feature flags (env vars):
 *   CHECKOUT_REMINDER_ENABLED        – "true" | "false"  (default: "false")
 *   CHECKOUT_REMINDER_MINUTES        – minutes before expiry to send (default: 5)
 *   CHECKOUT_REMINDER_SEND_WEBHOOK   – "true" | "false"  (default: "true")
 *   CHECKOUT_REMINDER_SEND_EMAIL     – "true" | "false"  (default: "true")
 *
 * Idempotency:
 *   - Payment.reminder_sent_at is set on first notification; subsequent runs skip it.
 *   - Webhook uses a stable event_id "{paymentId}:reminder" so createAndDeliverWebhook
 *     skips re-delivery if already sent.
 *   - CronLock prevents concurrent runs across multiple instances.
 */

import { PrismaClient } from "../generated/client/client";
import { createAndDeliverWebhook } from "./webhook.service";
import { sendCheckoutExpiryReminderEmail } from "./email.service";

const prisma = new PrismaClient();

const LOCK_NAME = "payment_expiry_reminder";
const LOCK_TTL_MS = 5 * 60 * 1000;

function getReminderConfig() {
  return {
    enabled: process.env.CHECKOUT_REMINDER_ENABLED === "true",
    minutesBefore: Math.max(
      1,
      parseInt(process.env.CHECKOUT_REMINDER_MINUTES ?? "5", 10) || 5,
    ),
    sendWebhook: process.env.CHECKOUT_REMINDER_SEND_WEBHOOK !== "false",
    sendEmail: process.env.CHECKOUT_REMINDER_SEND_EMAIL !== "false",
  };
}

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
        locked_at: now,
        expires_at: new Date(now.getTime() + LOCK_TTL_MS),
        locked_by: lockedBy,
      },
    });
    const lock = await prisma.cronLock.findUnique({ where: { job_name: LOCK_NAME } });
    return lock?.locked_by === lockedBy && lock.expires_at > now;
  } catch {
    return false;
  }
}

async function releaseLock(): Promise<void> {
  await prisma.cronLock
    .delete({ where: { job_name: LOCK_NAME } })
    .catch(() => {/* already gone */});
}

export interface ReminderResult {
  processed: number;
  notified: number;
  errors: { paymentId: string; error: string }[];
}

export async function runPaymentExpiryReminderJob(): Promise<ReminderResult> {
  const config = getReminderConfig();

  if (!config.enabled) {
    return { processed: 0, notified: 0, errors: [] };
  }

  const lockedBy = `${process.env.HOSTNAME ?? "app"}:${process.pid}`;
  const acquired = await acquireLock(lockedBy);
  if (!acquired) {
    console.log("[ExpiryReminder] Lock held by another instance — skipping.");
    return { processed: 0, notified: 0, errors: [] };
  }

  const result: ReminderResult = { processed: 0, notified: 0, errors: [] };

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + config.minutesBefore * 60 * 1000);

    // Payments that are:
    //  - still pending
    //  - expiring within the reminder window
    //  - not yet reminded (reminder_sent_at is null)
    const payments = await prisma.payment.findMany({
      where: {
        status: "pending",
        expiration: { gt: now, lte: windowEnd },
        reminder_sent_at: null,
      },
      select: {
        id: true,
        merchantId: true,
        amount: true,
        currency: true,
        customer_email: true,
        checkout_url: true,
        expiration: true,
      },
    });

    result.processed = payments.length;

    if (payments.length === 0) {
      return result;
    }

    console.log(`[ExpiryReminder] ${payments.length} payment(s) approaching expiry. Notifying merchants...`);

    for (const payment of payments) {
      // Mark as reminded first (idempotent guard) — only proceed if this succeeds
      const marked = await prisma.payment.updateMany({
        where: { id: payment.id, status: "pending", reminder_sent_at: null },
        data: { reminder_sent_at: now },
      });

      if (marked.count === 0) {
        // Another instance already handled this payment
        continue;
      }

      const minutesRemaining = Math.max(
        1,
        Math.round((payment.expiration.getTime() - now.getTime()) / 60_000),
      );

      const reminderPayload = {
        event: "payment.expiring_soon",
        data: {
          payment_id: payment.id,
          amount: payment.amount.toString(),
          currency: payment.currency,
          customer_email: payment.customer_email,
          checkout_url: payment.checkout_url,
          expires_at: payment.expiration.toISOString(),
          minutes_remaining: minutesRemaining,
        },
      };

      let hadError = false;

      // ── Webhook notification ──────────────────────────────────────────────
      if (config.sendWebhook) {
        try {
          await createAndDeliverWebhook(
            payment.merchantId,
            "payment_pending",          // closest existing event type per spec
            reminderPayload,
            payment.id,
            undefined,
            `${payment.id}:reminder`,   // stable event_id for deduplication
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[ExpiryReminder] Webhook failed for ${payment.id}: ${msg}`);
          result.errors.push({ paymentId: payment.id, error: `webhook: ${msg}` });
          hadError = true;
        }
      }

      // ── Email notification (merchant only) ───────────────────────────────
      if (config.sendEmail) {
        try {
          const merchant = await prisma.merchant.findUnique({
            where: { id: payment.merchantId },
            select: {
              email: true,
              business_name: true,
              email_notifications_enabled: true,
              notify_on_payment: true,
            },
          });

          if (
            merchant &&
            merchant.email_notifications_enabled &&
            merchant.notify_on_payment
          ) {
            await sendCheckoutExpiryReminderEmail(
              merchant.email,
              merchant.business_name,
              {
                payment_id: payment.id,
                amount: payment.amount.toString(),
                currency: payment.currency,
                customer_email: payment.customer_email,
                checkout_url: payment.checkout_url ?? "",
                expires_at: payment.expiration.toISOString(),
                minutes_remaining: minutesRemaining,
              },
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[ExpiryReminder] Email failed for ${payment.id}: ${msg}`);
          result.errors.push({ paymentId: payment.id, error: `email: ${msg}` });
          hadError = true;
        }
      }

      if (!hadError) result.notified++;
    }

    console.log(
      `[ExpiryReminder] Done — ${result.notified}/${result.processed} notified, ` +
      `${result.errors.length} error(s).`,
    );
  } finally {
    await releaseLock();
  }

  return result;
}
