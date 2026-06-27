-- Usage metering: plan limits + merchant usage periods
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "api_call_limit" INTEGER;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "charge_limit" INTEGER;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "settlement_volume_limit" DECIMAL(65,30);
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "overage_mode" TEXT NOT NULL DEFAULT 'hard_block';
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "features" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS "MerchantUsagePeriod" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "api_calls" INTEGER NOT NULL DEFAULT 0,
    "charges_created" INTEGER NOT NULL DEFAULT 0,
    "settlement_volume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "warning_80_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantUsagePeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MerchantUsagePeriod_merchantId_period_start_key"
    ON "MerchantUsagePeriod"("merchantId", "period_start");
CREATE INDEX IF NOT EXISTS "MerchantUsagePeriod_merchantId_idx"
    ON "MerchantUsagePeriod"("merchantId");

ALTER TABLE "MerchantUsagePeriod" ADD CONSTRAINT "MerchantUsagePeriod_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data export audit actions
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'data_export_requested';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'data_export_completed';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'data_export_failed';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'data_export_downloaded';

ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'data_export_job';
