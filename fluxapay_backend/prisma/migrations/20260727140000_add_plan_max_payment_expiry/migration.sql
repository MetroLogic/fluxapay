-- Allow per-plan configuration of payment expiry windows.
-- Used as both the plan default expiry and the maximum allowed expires_in_seconds.
ALTER TABLE "Plan" ADD COLUMN "max_payment_expiry_seconds" INTEGER;
