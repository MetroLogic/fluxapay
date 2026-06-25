-- Add dead-letter queue fields to WebhookLog
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMP(3);
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "failure_reason" TEXT;

-- Index for efficient DLQ queries
CREATE INDEX IF NOT EXISTS "WebhookLog_status_failed_at_idx" ON "WebhookLog"("status", "failed_at");

