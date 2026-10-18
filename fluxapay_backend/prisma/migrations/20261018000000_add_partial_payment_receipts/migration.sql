ALTER TABLE "Payment"
ADD COLUMN "amountReceived" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TYPE "WebhookEventType"
ADD VALUE IF NOT EXISTS 'payment_partial_received';
