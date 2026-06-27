-- PaymentStatus: cancelled for merchant deletion cascade
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'cancelled';

-- ReconciliationStatus: duplicate_payment
ALTER TYPE "ReconciliationStatus" ADD VALUE IF NOT EXISTS 'duplicate_payment';

-- AuditActionType: deletion, config, cascade events
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'merchant_deleted';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'config_updated';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'api_keys_revoked';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'webhooks_deactivated';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'charges_cancelled';

-- WebhookEventType: duplicate payment notification
ALTER TYPE "WebhookEventType" ADD VALUE IF NOT EXISTS 'payment_duplicate_received';

-- On-chain receipts per payment (duplicate detection)
CREATE TABLE IF NOT EXISTS "PaymentReceivedTransaction" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "payer_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReceivedTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentReceivedTransaction_paymentId_transaction_hash_key"
    ON "PaymentReceivedTransaction"("paymentId", "transaction_hash");
CREATE INDEX IF NOT EXISTS "PaymentReceivedTransaction_paymentId_idx"
    ON "PaymentReceivedTransaction"("paymentId");

ALTER TABLE "PaymentReceivedTransaction"
    ADD CONSTRAINT "PaymentReceivedTransaction_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Discrepancy alert metadata for duplicate payments
ALTER TABLE "DiscrepancyAlert" ADD COLUMN IF NOT EXISTS "discrepancy_type" TEXT;
ALTER TABLE "DiscrepancyAlert" ADD COLUMN IF NOT EXISTS "details" JSONB;
