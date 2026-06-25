-- Migration: Add webhook event types for partial payments and overpayments
-- Issue #448: Payment monitor: handle underpayment threshold and timeout rules

-- Step 1: Create a backup of existing webhook logs
CREATE TEMPORARY TABLE webhook_logs_backup AS
SELECT * FROM "WebhookLog";

-- Step 2: Drop the existing WebhookEventType enum (PostgreSQL doesn't support enum alteration)
DROP TYPE IF EXISTS "WebhookEventType";

-- Step 3: Recreate the WebhookEventType enum with new values
CREATE TYPE "WebhookEventType" AS ENUM(
  'payment_completed',
  'payment_failed', 
  'payment_pending',
  'payment_expired',
  'payment_partially_paid',
  'payment_overpaid',
  'refund_completed',
  'refund_failed',
  'settlement_completed',
  'settlement_failed',
  'subscription_created',
  'subscription_cancelled',
  'subscription_renewed'
);

-- Step 4: Update the WebhookLog table to use the new enum type
-- This will convert existing values to the new enum type
ALTER TABLE "WebhookLog" 
ALTER COLUMN "event_type" TYPE "WebhookEventType" 
USING "event_type"::text::"WebhookEventType";

-- Step 5: Verify the migration
SELECT 
  'Migration validation' as operation,
  COUNT(*) as total_webhook_logs,
  COUNT(CASE WHEN "event_type" = 'payment_partially_paid' THEN 1 END) as partially_paid_events,
  COUNT(CASE WHEN "event_type" = 'payment_overpaid' THEN 1 END) as overpaid_events
FROM "WebhookLog";

-- Clean up the temporary table
DROP TABLE IF EXISTS webhook_logs_backup;
