-- Add stable event_id to WebhookLog for idempotent delivery deduplication
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "event_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookLog_event_id_key" ON "WebhookLog"("event_id");
