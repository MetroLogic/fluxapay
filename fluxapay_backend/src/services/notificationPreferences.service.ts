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

import { PrismaClient } from "../generated/client/client";

const prisma = new PrismaClient();

export interface NotificationPreferences {
  merchantId: string;
  payment_expiry_reminder: boolean;
  reminder_minutes_before: number;
}

/** Defaults applied when no row exists for a merchant. */
const DEFAULTS: Omit<NotificationPreferences, "merchantId"> = {
  payment_expiry_reminder: true,
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
    reminder_minutes_before: row.reminder_minutes_before,
  };
}

export interface UpdateNotificationPreferencesInput {
  merchantId: string;
  payment_expiry_reminder?: boolean;
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

  // Clamp reminder_minutes_before to at least 1 minute
  if (
    updates.reminder_minutes_before !== undefined &&
    updates.reminder_minutes_before < 1
  ) {
    throw apiError(400, ErrorCode.INVALID_REMINDER_MINUTES, "reminder_minutes_before must be at least 1");
  }

  const existing = await prisma.merchantNotificationPreferences.findUnique({
    where: { merchantId },
  });

  const merged = {
    payment_expiry_reminder:
      updates.payment_expiry_reminder ??
      existing?.payment_expiry_reminder ??
      DEFAULTS.payment_expiry_reminder,
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
    reminder_minutes_before: row.reminder_minutes_before,
  };
}
