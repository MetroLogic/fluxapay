-- Add sweep tracking fields to Payment
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "stellar_address"    TEXT,
  ADD COLUMN IF NOT EXISTS "derivation_path"    TEXT,
  ADD COLUMN IF NOT EXISTS "encrypted_key_data" TEXT,
  ADD COLUMN IF NOT EXISTS "swept"              BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "swept_at"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sweep_tx_hash"      TEXT,
  ADD COLUMN IF NOT EXISTS "confirmed_at"       TIMESTAMP(3);

-- Index for sweep job query: unswept paid payments
CREATE INDEX IF NOT EXISTS "Payment_swept_status_idx" ON "Payment"("swept", "status");

-- DB lease table for cron concurrency control
CREATE TABLE IF NOT EXISTS "CronLock" (
  "job_name"   TEXT         NOT NULL,
  "locked_at"  TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "locked_by"  TEXT         NOT NULL,
  CONSTRAINT "CronLock_pkey" PRIMARY KEY ("job_name")
);

-- Enums for AuditLog
DO $$ BEGIN
  CREATE TYPE "AuditActionType" AS ENUM (
    'kyc_approve', 'kyc_reject', 'config_change',
    'sweep_trigger', 'sweep_complete', 'sweep_fail',
    'settlement_batch_initiate', 'settlement_batch_complete', 'settlement_batch_fail'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AuditEntityType" AS ENUM (
    'merchant_kyc', 'system_config', 'sweep_operation', 'settlement_batch'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Audit log table
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"          TEXT             NOT NULL,
  "admin_id"    TEXT             NOT NULL,
  "action_type" "AuditActionType" NOT NULL,
  "entity_type" "AuditEntityType" NOT NULL,
  "entity_id"   TEXT             NOT NULL,
  "details"     JSONB            NOT NULL,
  "created_at"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_admin_id_idx"    ON "AuditLog"("admin_id");
CREATE INDEX IF NOT EXISTS "AuditLog_action_type_idx" ON "AuditLog"("action_type");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_id_idx"   ON "AuditLog"("entity_id");
CREATE INDEX IF NOT EXISTS "AuditLog_created_at_idx"  ON "AuditLog"("created_at" DESC);
