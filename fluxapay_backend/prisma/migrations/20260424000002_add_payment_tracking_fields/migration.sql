-- Migration: Add paid_amount and last_seen_at fields to Payment model
-- Issue #448: Payment monitor: handle underpayment threshold and timeout rules

-- Step 1: Add paid_amount field to track cumulative payments
ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(65,30) DEFAULT 0;

-- Step 2: Add last_seen_at field to track when payment was last detected
ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS "Payment_paid_amount_idx" ON "Payment"("paid_amount")
WHERE "paid_amount" > 0;

CREATE INDEX IF NOT EXISTS "Payment_last_seen_at_idx" ON "Payment"("last_seen_at")
WHERE "last_seen_at" IS NOT NULL;

-- Step 4: Update existing payments with current transaction data
-- For payments with transaction_hash, set paid_amount to amount (assuming full payment)
-- and set last_seen_at to confirmed_at or createdAt
UPDATE "Payment"
SET
  "paid_amount" = "amount",
  "last_seen_at" = COALESCE("confirmed_at", "createdAt")
WHERE "transaction_hash" IS NOT NULL
  AND "paid_amount" = 0;
