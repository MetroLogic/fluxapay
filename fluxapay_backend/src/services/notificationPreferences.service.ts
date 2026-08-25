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
 */


import { prisma } from "../prisma";

export interface NotificationPreferences {
  merchantId: string;
  payment_expiry_reminder: boolean;
  sms_notifications_enabled: boolean;
  reminder_minutes_before: number;
}

/** Defaults applied when no row exists for a merchant. */
const DEFAULTS: Omit<NotificationPreferences, "merchantId"> = {
  payment_expiry_reminder: true,
  sms_notifications_enabled: false,
  reminder_minutes_before: 5,
};

/**
 * Return notification preferences for a merchant.
 * If no row exists, return the defaults (does NOT write to DB).
 */
export async function getNotificationPreferences(
  merchantId: string,
): Promise<NotificationPreferences> {
  const row = await prisma.merchantNotificationPreferences.findUnique({
    where: { merchantId },
  });

  if (!row) {
    return { merchantId, ...DEFAULTS };
  }

  return {
    merchantId: row.merchantId,
    payment_expiry_reminder: row.payment_expiry_reminder,
    sms_notifications_enabled: row.sms_notifications_enabled,
    reminder_minutes_before: row.reminder_minutes_before,
  };
}

export interface UpdateNotificationPreferencesInput {
  merchantId: string;
  payment_expiry_reminder?: boolean;
  sms_notifications_enabled?: boolean;
  reminder_minutes_before?: number;
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

  // Keep reminder_minutes_before within the supported 1-minute to 24-hour range.
  if (
    updates.reminder_minutes_before !== undefined &&
    (updates.reminder_minutes_before < 1 ||
      updates.reminder_minutes_before > 1440)
  ) {
    throw apiError(
      400,
      ErrorCode.INVALID_REMINDER_MINUTES,
      "reminder_minutes_before must be between 1 and 1440 (24 hours)",
    );
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

  return {
    merchantId: row.merchantId,
    payment_expiry_reminder: row.payment_expiry_reminder,
    sms_notifications_enabled: row.sms_notifications_enabled,
    reminder_minutes_before: row.reminder_minutes_before,
  };
}
