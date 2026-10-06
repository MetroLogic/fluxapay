import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
/**
 * notificationPreferences.service.ts
 *
 * CRUD for per-merchant notification preferences stored in
 * MerchantNotificationPreferences.
 *
 * Design:
 *  - A missing row means all defaults apply (reminders enabled, 5 min before).
 *  - Reads always return a fully-populated object — callers never need to
 *    handle undefined/null for individual fields.
 *  - `notify_on_payment` is the exception: it is a column on `Merchant`, not on
 *    the preferences table, because `emailNotification.service.ts` reads it
 *    there when deciding whether to send a confirmation. It is surfaced through
 *    this service so merchants have a single endpoint for their preferences
 *    rather than one field being stranded outside it (#1190).
 */

import { PrismaClient } from "../generated/client/client";
import { prisma } from "../config/prisma";


export interface NotificationPreferences {
  merchantId: string;
  payment_expiry_reminder: boolean;
  sms_notifications_enabled: boolean;
  reminder_minutes_before: number;
  notify_on_payment: boolean;
}

/** Defaults applied when no row exists for a merchant. */
const DEFAULTS: Omit<NotificationPreferences, "merchantId"> = {
  payment_expiry_reminder: true,
  sms_notifications_enabled: false,
  reminder_minutes_before: 5,
  // Mirrors Merchant.notify_on_payment's own default so a merchant without a
  // preferences row reads the same whether or not one has been created yet.
  notify_on_payment: true,
};

/**
 * Return notification preferences for a merchant.
 * If no row exists, return the defaults (does NOT write to DB).
 */
export async function getNotificationPreferences(
  merchantId: string,
): Promise<NotificationPreferences> {
  const [row, merchant] = await Promise.all([
    prisma.merchantNotificationPreferences.findUnique({
      where: { merchantId },
    }),
    prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { notify_on_payment: true },
    }),
  ]);

  // Fall back to the default rather than to `false` if the merchant row is
  // missing, so a lookup miss cannot silently read as "opted out".
  const notifyOnPayment = merchant?.notify_on_payment ?? DEFAULTS.notify_on_payment;

  if (!row) {
    return { merchantId, ...DEFAULTS, notify_on_payment: notifyOnPayment };
  }

  return {
    merchantId: row.merchantId,
    payment_expiry_reminder: row.payment_expiry_reminder,
    sms_notifications_enabled: row.sms_notifications_enabled,
    reminder_minutes_before: row.reminder_minutes_before,
    notify_on_payment: notifyOnPayment,
  };
}

export interface UpdateNotificationPreferencesInput {
  merchantId: string;
  payment_expiry_reminder?: boolean;
  sms_notifications_enabled?: boolean;
  reminder_minutes_before?: number;
  notify_on_payment?: boolean;
}

/**
 * Upsert notification preferences for a merchant.
 * Only provided fields are changed; absent fields keep their current / default values.
 */
export async function updateNotificationPreferences(
  input: UpdateNotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const { merchantId, ...updates } = input;

  if (updates.sms_notifications_enabled === true) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { verified_phone: true },
    });
    if (!merchant?.verified_phone) {
      throw apiError(422, ErrorCode.PHONE_NOT_VERIFIED, "Enable SMS notifications requires a verified phone number. Please verify your phone first.");
    }
  }

  // Clamp reminder_minutes_before to at least 1 minute
  if (
    updates.reminder_minutes_before !== undefined &&
    updates.reminder_minutes_before < 1
  ) {
    throw apiError(400, ErrorCode.INVALID_REMINDER_MINUTES, "reminder_minutes_before must be at least 1");
  }

  // notify_on_payment lives on Merchant, so it is written separately from the
  // preferences row (#1190).
  if (updates.notify_on_payment !== undefined) {
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { notify_on_payment: updates.notify_on_payment },
      select: { id: true },
    });
  }

  const existing = await prisma.merchantNotificationPreferences.findUnique({
    where: { merchantId },
  });

  const merged = {
    payment_expiry_reminder:
      updates.payment_expiry_reminder ??
      existing?.payment_expiry_reminder ??
      DEFAULTS.payment_expiry_reminder,
    sms_notifications_enabled:
      updates.sms_notifications_enabled ??
      existing?.sms_notifications_enabled ??
      DEFAULTS.sms_notifications_enabled,
    reminder_minutes_before:
      updates.reminder_minutes_before ??
      existing?.reminder_minutes_before ??
      DEFAULTS.reminder_minutes_before,
  };

  const row = await prisma.merchantNotificationPreferences.upsert({
    where: { merchantId },
    create: { merchantId, ...merged },
    update: merged,
  });

  // Read the flag back rather than echoing the input, so the response always
  // reflects what is actually stored.
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { notify_on_payment: true },
  });

  return {
    merchantId: row.merchantId,
    payment_expiry_reminder: row.payment_expiry_reminder,
    sms_notifications_enabled: row.sms_notifications_enabled,
    reminder_minutes_before: row.reminder_minutes_before,
    notify_on_payment: merchant?.notify_on_payment ?? DEFAULTS.notify_on_payment,
  };
}

