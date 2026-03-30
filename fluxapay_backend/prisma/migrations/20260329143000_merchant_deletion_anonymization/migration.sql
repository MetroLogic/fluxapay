-- Add compliance columns to Merchant
ALTER TABLE "Merchant"
  ADD COLUMN "deletion_requested_at" TIMESTAMP(3),
  ADD COLUMN "anonymized_at"         TIMESTAMP(3);

-- Extend AuditActionType enum
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'merchant_deletion_requested';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'merchant_anonymized';

-- Extend AuditEntityType enum
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'merchant_account';

-- CreateTable: MerchantDeletionRequest
CREATE TABLE "MerchantDeletionRequest" (
    "id"           TEXT NOT NULL,
    "merchantId"   TEXT NOT NULL,
    "reason"       TEXT,
    "requested_by" TEXT NOT NULL,
    "executed_at"  TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantDeletionRequest_merchantId_key"
    ON "MerchantDeletionRequest"("merchantId");

CREATE INDEX "MerchantDeletionRequest_merchantId_idx"
    ON "MerchantDeletionRequest"("merchantId");
