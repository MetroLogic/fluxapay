-- CreateTable: per-merchant notification preferences
-- Absence of a row means all defaults (reminders enabled, 5 minutes before).
CREATE TABLE IF NOT EXISTS "MerchantNotificationPreferences" (
    "merchantId"              TEXT         NOT NULL,
    "payment_expiry_reminder" BOOLEAN      NOT NULL DEFAULT true,
    "reminder_minutes_before" INTEGER      NOT NULL DEFAULT 5,
    "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantNotificationPreferences_pkey" PRIMARY KEY ("merchantId")
);
