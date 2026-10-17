-- #1250: values used by legacy admin audit writes for API key events
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'api_key_created';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'api_key_revoked';

-- CreateEnum
CREATE TYPE "PayoutMethodType" AS ENUM ('bank_account');

-- CreateEnum
CREATE TYPE "PayoutMethodStatus" AS ENUM ('active', 'pending_verification', 'archived');

-- CreateEnum
CREATE TYPE "ApiKeyAuditAction" AS ENUM ('created', 'updated', 'rotated', 'revoked', 'regenerated');

-- CreateEnum
CREATE TYPE "UnallocatedDepositReason" AS ENUM ('missing_memo', 'invalid_memo', 'spoofed_asset', 'unsupported_asset', 'underpaid');

-- CreateEnum
CREATE TYPE "UnallocatedDepositStatus" AS ENUM ('pending_review', 'resolved', 'refunded', 'ignored');

-- CreateTable
CREATE TABLE "MerchantPayoutMethod" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "PayoutMethodType" NOT NULL DEFAULT 'bank_account',
    "status" "PayoutMethodStatus" NOT NULL DEFAULT 'pending_verification',
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "bank_name" TEXT,
    "bank_code" TEXT,
    "beneficiary_name" TEXT NOT NULL,
    "account_number_encrypted" TEXT NOT NULL,
    "account_number_last4" TEXT NOT NULL,
    "account_fingerprint" TEXT NOT NULL,
    "routing_number_encrypted" TEXT,
    "routing_number_last4" TEXT,
    "label" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantPayoutMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKeyAuditLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "action" "ApiKeyAuditAction" NOT NULL,
    "api_key_id" TEXT,
    "key_prefix" TEXT NOT NULL,
    "key_last_four" TEXT,
    "environment" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKeyAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnallocatedDeposit" (
    "id" TEXT NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "destination_address" TEXT NOT NULL,
    "source_address" TEXT,
    "asset_type" TEXT NOT NULL,
    "asset_code" TEXT,
    "asset_issuer" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "memo_type" TEXT,
    "memo" TEXT,
    "reason" "UnallocatedDepositReason" NOT NULL,
    "candidate_payment_id" TEXT,
    "status" "UnallocatedDepositStatus" NOT NULL DEFAULT 'pending_review',
    "details" JSONB,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnallocatedDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantPayoutMethod_merchantId_status_idx" ON "MerchantPayoutMethod"("merchantId", "status");

-- CreateIndex
CREATE INDEX "MerchantPayoutMethod_merchantId_account_fingerprint_idx" ON "MerchantPayoutMethod"("merchantId", "account_fingerprint");

-- CreateIndex
CREATE INDEX "ApiKeyAuditLog_merchantId_created_at_idx" ON "ApiKeyAuditLog"("merchantId", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ApiKeyAuditLog_api_key_id_idx" ON "ApiKeyAuditLog"("api_key_id");

-- CreateIndex
CREATE INDEX "UnallocatedDeposit_status_created_at_idx" ON "UnallocatedDeposit"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "UnallocatedDeposit_destination_address_idx" ON "UnallocatedDeposit"("destination_address");

-- CreateIndex
CREATE INDEX "UnallocatedDeposit_candidate_payment_id_idx" ON "UnallocatedDeposit"("candidate_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "UnallocatedDeposit_operation_id_reason_key" ON "UnallocatedDeposit"("operation_id", "reason");

-- AddForeignKey
ALTER TABLE "MerchantPayoutMethod" ADD CONSTRAINT "MerchantPayoutMethod_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- #1250: the API key audit trail is append-only. Reject UPDATE and DELETE at
-- the database level so even a bug or a stray script cannot rewrite history.
CREATE OR REPLACE FUNCTION "api_key_audit_log_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ApiKeyAuditLog is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ApiKeyAuditLog_append_only"
BEFORE UPDATE OR DELETE ON "ApiKeyAuditLog"
FOR EACH ROW EXECUTE FUNCTION "api_key_audit_log_immutable"();
