-- Baseline migration: Create all tables and enums that were originally
-- applied via `prisma db push` and never captured in a migration file.
-- This migration must run BEFORE 20260325182803_add_high_cardinality_indexes.

-- ─── Enums ───────────────────────────────────────────────────────────────────

-- SettlementStatus
DO $$ BEGIN
  CREATE TYPE "SettlementStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- BusinessType
DO $$ BEGIN
  CREATE TYPE "BusinessType" AS ENUM ('individual', 'registered_business');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- GovernmentIdType
DO $$ BEGIN
  CREATE TYPE "GovernmentIdType" AS ENUM ('passport', 'national_id', 'driver_license');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- KYCStatus
DO $$ BEGIN
  CREATE TYPE "KYCStatus" AS ENUM ('not_submitted', 'pending_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DocumentType
DO $$ BEGIN
  CREATE TYPE "DocumentType" AS ENUM ('government_id', 'proof_of_business_registration', 'proof_of_address');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RefundStatus
DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- InvoiceStatus
DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'overdue', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ReconciliationStatus
DO $$ BEGIN
  CREATE TYPE "ReconciliationStatus" AS ENUM ('ok', 'discrepancy', 'discrepancy_detected', 'duplicate_payment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlertSeverity
DO $$ BEGIN
  CREATE TYPE "AlertSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- WebhookDeliveryStatus
DO $$ BEGIN
  CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- Settlement
CREATE TABLE IF NOT EXISTS "Settlement" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "usdc_amount" DECIMAL(65,30),
    "amount" DECIMAL(65,30) NOT NULL,
    "fees" DECIMAL(65,30) NOT NULL,
    "net_amount" DECIMAL(65,30),
    "currency" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'pending',
    "exchange_partner" TEXT,
    "exchange_rate" DECIMAL(65,30),
    "exchange_ref" TEXT,
    "bank_transfer_id" TEXT,
    "breakdown" JSONB,
    "payment_ids" JSONB,
    "failure_reason" TEXT,
    "payout_partner_payload" JSONB,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "processed_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- MerchantKYC
CREATE TABLE IF NOT EXISTS "MerchantKYC" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "business_type" "BusinessType" NOT NULL,
    "legal_business_name" TEXT NOT NULL,
    "business_registration_number" TEXT,
    "country_of_registration" TEXT NOT NULL,
    "business_address" TEXT NOT NULL,
    "director_full_name" TEXT NOT NULL,
    "director_email" TEXT NOT NULL,
    "director_phone" TEXT NOT NULL,
    "government_id_type" "GovernmentIdType" NOT NULL,
    "government_id_number" TEXT NOT NULL,
    "kyc_status" "KYCStatus" NOT NULL DEFAULT 'not_submitted',
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchantKYC_pkey" PRIMARY KEY ("id")
);

-- KYCDocument
CREATE TABLE IF NOT EXISTS "KYCDocument" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KYCDocument_pkey" PRIMARY KEY ("id")
);

-- BankAccount
CREATE TABLE IF NOT EXISTS "BankAccount" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_code" TEXT,
    "currency" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- MerchantHDIndex
CREATE TABLE IF NOT EXISTS "MerchantHDIndex" (
    "merchantId" TEXT NOT NULL,
    "merchant_index" INTEGER NOT NULL,
    "payment_counter" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchantHDIndex_pkey" PRIMARY KEY ("merchantId")
);

-- HDIndexCounter
CREATE TABLE IF NOT EXISTS "HDIndexCounter" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "next_merchant_index" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HDIndexCounter_pkey" PRIMARY KEY ("id")
);

-- ManualIntervention
CREATE TABLE IF NOT EXISTS "ManualIntervention" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "issue_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManualIntervention_pkey" PRIMARY KEY ("id")
);

-- Plan
CREATE TABLE IF NOT EXISTS "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "api_call_limit" INTEGER,
    "charge_limit" INTEGER,
    "settlement_volume_limit" DECIMAL(65,30),
    "overage_mode" TEXT NOT NULL DEFAULT 'hard_block',
    "features" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- MerchantSubscription
CREATE TABLE IF NOT EXISTS "MerchantSubscription" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billing_cycle" TEXT NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "next_billing_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchantSubscription_pkey" PRIMARY KEY ("id")
);

-- Payment
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "usdc_amount" DECIMAL(65,30),
    "fx_rate" DECIMAL(65,30),
    "customer_email" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL,
    "expiration" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_amount" DECIMAL(65,30) DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),
    "checkout_url" TEXT NOT NULL,
    "success_url" TEXT,
    "cancel_url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stellar_address" TEXT,
    "derivation_path" TEXT,
    "encrypted_key_data" TEXT,
    "payment_index" INTEGER,
    "transaction_hash" TEXT,
    "contract_tx_hash" TEXT,
    "payer_address" TEXT,
    "onchain_verified" BOOLEAN DEFAULT false,
    "verification_error" TEXT,
    "last_paging_token" TEXT,
    "swept" BOOLEAN NOT NULL DEFAULT false,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "swept_at" TIMESTAMP(3),
    "sweep_tx_hash" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "settlement_ref" TEXT,
    "settlement_fiat_amount" DECIMAL(65,30),
    "settlement_fiat_currency" TEXT,
    "settlementId" TEXT,
    "paymentLinkId" TEXT,
    "reminder_sent_at" TIMESTAMP(3),
    "webhook_status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "webhook_retries" INTEGER NOT NULL DEFAULT 0,
    "escrow_mode" BOOLEAN NOT NULL DEFAULT false,
    "escrow_contract_address" TEXT,
    "escrow_status" TEXT,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Refund
CREATE TABLE IF NOT EXISTS "Refund" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "failed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- Invoice
CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotal" DECIMAL(65,30),
    "tax_amount" DECIMAL(65,30),
    "tax_rate" DECIMAL(65,30),
    "customer_email" TEXT NOT NULL,
    "customer_name" TEXT,
    "line_items" JSONB,
    "notes" TEXT,
    "metadata" JSONB,
    "payment_id" TEXT,
    "payment_link" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "due_date" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- ReconciliationRecord
CREATE TABLE IF NOT EXISTS "ReconciliationRecord" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "expected_total" DECIMAL(65,30) NOT NULL,
    "actual_total" DECIMAL(65,30) NOT NULL,
    "discrepancy_amount" DECIMAL(65,30) NOT NULL,
    "discrepancy_percent" DECIMAL(65,30) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'ok',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReconciliationRecord_pkey" PRIMARY KEY ("id")
);

-- DailyReconciliationReport
CREATE TABLE IF NOT EXISTS "DailyReconciliationReport" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "report_date" TIMESTAMP(3) NOT NULL,
    "total_charges" INTEGER NOT NULL DEFAULT 0,
    "total_volume_usdc" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total_volume_fiat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total_fees" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total_net_settled" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "report_data" JSONB NOT NULL DEFAULT '{}',
    "csv_url" TEXT,
    "emailed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyReconciliationReport_pkey" PRIMARY KEY ("id")
);

-- DiscrepancyThreshold
CREATE TABLE IF NOT EXISTS "DiscrepancyThreshold" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "amount_threshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "percent_threshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscrepancyThreshold_pkey" PRIMARY KEY ("id")
);

-- DiscrepancyAlert
CREATE TABLE IF NOT EXISTS "DiscrepancyAlert" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "reconciliationRecordId" TEXT NOT NULL,
    "thresholdId" TEXT,
    "severity" "AlertSeverity" NOT NULL,
    "discrepancy_type" TEXT,
    "details" JSONB,
    "message" TEXT NOT NULL,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscrepancyAlert_pkey" PRIMARY KEY ("id")
);

-- PaymentLink
CREATE TABLE IF NOT EXISTS "PaymentLink" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(65,30),
    "currency" TEXT NOT NULL,
    "redirect_url" TEXT,
    "expiry" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "total_payments" INTEGER NOT NULL DEFAULT 0,
    "total_volume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- WorkerState
CREATE TABLE IF NOT EXISTS "WorkerState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "WorkerState_pkey" PRIMARY KEY ("key")
);

-- RefreshToken
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "is_reused" BOOLEAN NOT NULL DEFAULT false,
    "created_at_ip" TEXT,
    "created_at_user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- LoginAttempt
CREATE TABLE IF NOT EXISTS "LoginAttempt" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- RateLimitLog
CREATE TABLE IF NOT EXISTS "RateLimitLog" (
    "id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "limit_type" TEXT NOT NULL,
    "retry_after_seconds" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimitLog_pkey" PRIMARY KEY ("id")
);

-- ApiKey
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_last_four" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'live',
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- ─── Unique Constraints ─────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "MerchantKYC_merchantId_key" ON "MerchantKYC"("merchantId");
CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_merchantId_key" ON "BankAccount"("merchantId");
CREATE UNIQUE INDEX IF NOT EXISTS "MerchantHDIndex_merchant_index_key" ON "MerchantHDIndex"("merchant_index");
CREATE UNIQUE INDEX IF NOT EXISTS "Plan_slug_key" ON "Plan"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoice_number_key" ON "Invoice"("invoice_number");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_payment_id_key" ON "Invoice"("payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationRecord_merchantId_period_start_period_end_key" ON "ReconciliationRecord"("merchantId", "period_start", "period_end");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyReconciliationReport_merchantId_report_date_key" ON "DailyReconciliationReport"("merchantId", "report_date");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentLink_slug_key" ON "PaymentLink"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_token_hash_key" ON "RefreshToken"("token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_key_hash_key" ON "ApiKey"("key_hash");

-- ─── Regular Indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "Settlement_merchantId_status_idx" ON "Settlement"("merchantId", "status");
CREATE INDEX IF NOT EXISTS "Settlement_merchantId_scheduled_date_idx" ON "Settlement"("merchantId", "scheduled_date" DESC);
CREATE INDEX IF NOT EXISTS "Payment_swept_status_idx" ON "Payment"("swept", "status");
CREATE INDEX IF NOT EXISTS "Refund_merchantId_status_created_at_idx" ON "Refund"("merchantId", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "Invoice_merchantId_created_at_idx" ON "Invoice"("merchantId", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "Invoice_merchantId_status_created_at_idx" ON "Invoice"("merchantId", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "DiscrepancyThreshold_merchantId_is_active_idx" ON "DiscrepancyThreshold"("merchantId", "is_active");
CREATE INDEX IF NOT EXISTS "DiscrepancyAlert_merchantId_is_resolved_idx" ON "DiscrepancyAlert"("merchantId", "is_resolved");
CREATE INDEX IF NOT EXISTS "DailyReconciliationReport_merchantId_idx" ON "DailyReconciliationReport"("merchantId");
CREATE INDEX IF NOT EXISTS "DailyReconciliationReport_report_date_idx" ON "DailyReconciliationReport"("report_date");
CREATE INDEX IF NOT EXISTS "PaymentLink_merchantId_idx" ON "PaymentLink"("merchantId");
CREATE INDEX IF NOT EXISTS "PaymentLink_slug_idx" ON "PaymentLink"("slug");
CREATE INDEX IF NOT EXISTS "PaymentLink_active_idx" ON "PaymentLink"("active");
CREATE INDEX IF NOT EXISTS "PaymentLink_expiry_idx" ON "PaymentLink"("expiry");
CREATE INDEX IF NOT EXISTS "RefreshToken_merchantId_idx" ON "RefreshToken"("merchantId");
CREATE INDEX IF NOT EXISTS "RefreshToken_token_hash_idx" ON "RefreshToken"("token_hash");
CREATE INDEX IF NOT EXISTS "RefreshToken_expires_at_idx" ON "RefreshToken"("expires_at");
CREATE INDEX IF NOT EXISTS "LoginAttempt_merchantId_idx" ON "LoginAttempt"("merchantId");
CREATE INDEX IF NOT EXISTS "LoginAttempt_email_idx" ON "LoginAttempt"("email");
CREATE INDEX IF NOT EXISTS "LoginAttempt_ip_address_idx" ON "LoginAttempt"("ip_address");
CREATE INDEX IF NOT EXISTS "LoginAttempt_created_at_idx" ON "LoginAttempt"("created_at");
CREATE INDEX IF NOT EXISTS "RateLimitLog_ip_address_idx" ON "RateLimitLog"("ip_address");
CREATE INDEX IF NOT EXISTS "RateLimitLog_timestamp_idx" ON "RateLimitLog"("timestamp");
CREATE INDEX IF NOT EXISTS "RateLimitLog_limit_type_idx" ON "RateLimitLog"("limit_type");
CREATE INDEX IF NOT EXISTS "ApiKey_merchantId_idx" ON "ApiKey"("merchantId");
CREATE INDEX IF NOT EXISTS "ApiKey_merchantId_status_idx" ON "ApiKey"("merchantId", "status");
CREATE INDEX IF NOT EXISTS "ApiKey_key_hash_idx" ON "ApiKey"("key_hash");

-- ─── Foreign Keys ───────────────────────────────────────────────────────────

ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MerchantKYC" ADD CONSTRAINT "MerchantKYC_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KYCDocument" ADD CONSTRAINT "KYCDocument_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "MerchantKYC"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MerchantHDIndex" ADD CONSTRAINT "MerchantHDIndex_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MerchantSubscription" ADD CONSTRAINT "MerchantSubscription_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MerchantSubscription" ADD CONSTRAINT "MerchantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyReconciliationReport" ADD CONSTRAINT "DailyReconciliationReport_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscrepancyThreshold" ADD CONSTRAINT "DiscrepancyThreshold_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscrepancyAlert" ADD CONSTRAINT "DiscrepancyAlert_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscrepancyAlert" ADD CONSTRAINT "DiscrepancyAlert_reconciliationRecordId_fkey" FOREIGN KEY ("reconciliationRecordId") REFERENCES "ReconciliationRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscrepancyAlert" ADD CONSTRAINT "DiscrepancyAlert_thresholdId_fkey" FOREIGN KEY ("thresholdId") REFERENCES "DiscrepancyThreshold"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Also add missing columns / constraints to Merchant that were applied via db push
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "webhook_url" TEXT;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "webhook_secret" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "api_key_hashed" TEXT;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "api_key_last_four" TEXT;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "settlement_schedule" TEXT DEFAULT 'daily';
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "settlement_day" INTEGER;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "settlement_fee_percent" DECIMAL(65,30) NOT NULL DEFAULT 1.5;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "checkout_logo_url" TEXT;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "checkout_accent_color" TEXT;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "notify_on_payment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "notify_on_settlement" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "onchain_registered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "onchain_registry_tx_hash" TEXT;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "deletion_requested_at" TIMESTAMP(3);
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "anonymized_at" TIMESTAMP(3);
