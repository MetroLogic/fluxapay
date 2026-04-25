-- Add stable event_id to WebhookLog for idempotent delivery deduplication
ALTER TABLE "WebhookLog" ADD COLUMN "event_id" TEXT;
CREATE UNIQUE INDEX "WebhookLog_event_id_key" ON "WebhookLog"("event_id");
