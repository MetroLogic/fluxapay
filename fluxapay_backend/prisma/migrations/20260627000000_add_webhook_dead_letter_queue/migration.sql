-- CreateTable WebhookDeadLetterQueue
CREATE TABLE "WebhookDeadLetterQueue" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "webhookLogId" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "endpoint_url" TEXT NOT NULL,
    "failure_reason" TEXT NOT NULL,
    "last_http_status" INTEGER,
    "request_payload" JSONB,
    "response_body" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "alert_sent_at" TIMESTAMP(3),
    "replayed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDeadLetterQueue_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint on webhookLogId
CREATE UNIQUE INDEX "WebhookDeadLetterQueue_webhookLogId_key" ON "WebhookDeadLetterQueue"("webhookLogId");

-- Create indexes for efficient querying
CREATE INDEX "WebhookDeadLetterQueue_merchantId_created_at_idx" ON "WebhookDeadLetterQueue"("merchantId", "created_at" DESC);
CREATE INDEX "WebhookDeadLetterQueue_expires_at_idx" ON "WebhookDeadLetterQueue"("expires_at");

-- Add foreign key constraints
ALTER TABLE "WebhookDeadLetterQueue" ADD CONSTRAINT "WebhookDeadLetterQueue_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebhookDeadLetterQueue" ADD CONSTRAINT "WebhookDeadLetterQueue_webhookLogId_fkey" FOREIGN KEY ("webhookLogId") REFERENCES "WebhookLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
