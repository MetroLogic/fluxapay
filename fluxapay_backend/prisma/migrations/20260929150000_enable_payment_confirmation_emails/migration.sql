-- Migration: enable payment confirmation emails by default
-- Issue #1190: "Send an email notification to the merchant when a payment is
-- successfully completed."
--
-- The plumbing already existed (emailNotification.service.ts listens for
-- AppEvents.PAYMENT_CONFIRMED, and paymentOracle.service.ts emits it), but
-- Merchant.notify_on_payment was declared DEFAULT false, so the handler in
-- emailNotification.service.ts returned early for every merchant and no payment
-- confirmation email was ever sent. The column was also unreachable: nothing in
-- the codebase ever wrote it, and PATCH /api/v1/merchants/me/notification-
-- preferences did not accept it.
--
-- This migration makes the flag on by default and backfills the existing
-- merchants so the feature is live for accounts that predate it.
--
-- Additive: it only relaxes a default and sets a boolean on existing rows. No
-- data is dropped, so it is safe to deploy automatically.

-- 1. New merchants default to receiving payment confirmation emails.
ALTER TABLE "Merchant"
  ALTER COLUMN "notify_on_payment" SET DEFAULT true;

-- 2. Existing merchants keep the intent of the old default only in the sense
--    that it was never a deliberate opt-out: no API ever exposed the flag, so a
--    false value here means "created before the feature was reachable" rather
--    than "merchant asked not to be emailed". Flip them on.
--
--    A merchant that later opts out via the notification-preferences endpoint is
--    unaffected, because that write happens after this migration has run.
UPDATE "Merchant"
  SET "notify_on_payment" = true
  WHERE "notify_on_payment" = false;
