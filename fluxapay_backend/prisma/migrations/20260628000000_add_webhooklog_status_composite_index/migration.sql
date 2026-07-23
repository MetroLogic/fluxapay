-- Replace the merchantId+status index with a status-aware composite index
-- that also covers created_at ordering, matching the Payment/Invoice pattern.
DROP INDEX IF EXISTS "WebhookLog_merchantId_status_idx";

CREATE INDEX IF NOT EXISTS "WebhookLog_merchantId_status_created_at_idx"
  ON "WebhookLog"("merchantId", "status", "created_at" DESC);
