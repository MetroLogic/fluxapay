/**
 * paymentExpiryReminder.service.ts
 *
 * Scheduled job: find pending payments whose expiration falls within the
 * configurable reminder window and notify the merchant via webhook and/or email.
 *
 * Notification preference behaviour:
 *   - Before sending any notification, the merchant's
 *     MerchantNotificationPreferences.payment_expiry_reminder flag is checked.
 *   - If false (opted out), reminder is skipped for that merchant.
 *   - The per-merchant reminder_minutes_before value overrides the global
 *     CHECKOUT_REMINDER_MINUTES env var when present.
 *   - Default preference: reminders enabled, 5 minutes before expiry.
 *   - Preferences are settable via PATCH /v1/merchants/me/notification-preferences.
 *
 * Feature flags (env vars):
 *   CHECKOUT_REMINDER_ENABLED        – "true" | "false"  (default: "false")
 *   CHECKOUT_REMINDER_MINUTES        – global fallback minutes before expiry (default: 5)
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
import { getNotificationPreferences } from "./notificationPreferences.service";

const prisma = new PrismaClient();

const LOCK_NAME = "payment_expiry_reminder";
const LOCK_TTL_MS = 5 * 60 * 1000;

function getGlobalReminderConfig() {
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
  skippedOptOut: number;
  errors: { paymentId: string; error: string }[];
}

export async function runPaymentExpiryReminderJob(): Promise<ReminderResult> {
  const config = getGlobalReminderConfig();

  if (!config.enabled) {
    return { processed: 0, notified: 0, skippedOptOut: 0, errors: [] };
  }

  const lockedBy = `${process.env.HOSTNAME ?? "app"}:${process.pid}`;
  const acquired = await acquireLock(lockedBy);
  if (!acquired) {
    console.log("[ExpiryReminder] Lock held by another instance — skipping.");
    return { processed: 0, notified: 0, skippedOptOut: 0, errors: [] };
  }

  const result: ReminderResult = { processed: 0, notified: 0, skippedOptOut: 0, errors: [] };

  try {
    const now = new Date();

    // The query window must be wide enough to cover the largest possible
    // per-merchant reminder_minutes_before value.  We use the global fallback
    // as the upper bound; payments outside that window are simply not fetched.
    // Individual payments are later re-filtered by the merchant's own preference.
    const maxWindowEnd = new Date(now.getTime() + config.minutesBefore * 60 * 1000);

    // Payments that are:
    //  - still pending
    //  - expiring within the broadest reminder window
    //  - not yet reminded (reminder_sent_at is null)
    const payments = await prisma.payment.findMany({
      where: {
        status: "pending",
        expiration: { gt: now, lte: maxWindowEnd },
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

    console.log(`[ExpiryReminder] ${payments.length} payment(s) approaching expiry. Checking preferences...`);

    // ── Batch-load notification preferences for all distinct merchants ─────
    // This avoids one DB round-trip per payment (N+1).
    const merchantIds = [...new Set(payments.map((p) => p.merchantId))];
    const prefsMap = new Map<
      string,
      { payment_expiry_reminder: boolean; reminder_minutes_before: number }
    >();

    await Promise.all(
      merchantIds.map(async (merchantId) => {
        const prefs = await getNotificationPreferences(merchantId);
        prefsMap.set(merchantId, prefs);
      }),
    );

    // ── Batch-load merchant email details for all opted-in merchants ───────
    const optedInMerchantIds = merchantIds.filter(
      (id) => prefsMap.get(id)?.payment_expiry_reminder !== false,
    );

    const merchantEmailMap = new Map<
      string,
      { email: string; business_name: string; email_notifications_enabled: boolean; notify_on_payment: boolean }
    >();

    if (config.sendEmail && optedInMerchantIds.length > 0) {
      const merchants = await prisma.merchant.findMany({
        where: { id: { in: optedInMerchantIds } },
        select: {
          id: true,
          email: true,
          business_name: true,
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      });
      for (const m of merchants) {
        merchantEmailMap.set(m.id, m);
      }
    }

    // ── Process each payment ───────────────────────────────────────────────
    for (const payment of payments) {
      const prefs = prefsMap.get(payment.merchantId) ?? {
        payment_expiry_reminder: true,
        reminder_minutes_before: config.minutesBefore,
      };

      // ── 1. Check opt-out ───────────────────────────────────────────────
      if (!prefs.payment_expiry_reminder) {
        result.skippedOptOut++;
        console.log(
          `[ExpiryReminder] Merchant ${payment.merchantId} opted out — skipping payment ${payment.id}`,
        );
        continue;
      }

      // ── 2. Check per-merchant timing window ───────────────────────────
      // The payment must still be within this merchant's reminder window.
      const merchantWindowEnd = new Date(
        now.getTime() + prefs.reminder_minutes_before * 60 * 1000,
      );
      if (payment.expiration > merchantWindowEnd) {
        // Too early for this merchant's preference; will be picked up on a future tick.
        continue;
      }

      // ── 3. Mark as reminded (idempotent guard) ────────────────────────
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

      // ── 4. Webhook notification ──────────────────────────────────────
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

      // ── 5. Email notification (merchant) ─────────────────────────────
      if (config.sendEmail) {
        try {
          const merchant = merchantEmailMap.get(payment.merchantId);

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
      `${result.skippedOptOut} opted-out, ${result.errors.length} error(s).`,
    );
  } finally {
    await releaseLock();
  }

  return result;
}
