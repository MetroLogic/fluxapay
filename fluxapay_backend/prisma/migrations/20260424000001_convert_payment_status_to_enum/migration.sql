-- Migration: Convert Payment status from string to PaymentStatus enum
-- Issue #417: Payment statuses - replace free-form strings with enum + migration

-- Step 1: Create the PaymentStatus enum type if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM('pending', 'partially_paid', 'confirmed', 'overpaid', 'expired', 'failed', 'paid', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create a backup of existing data and validate all current values match the enum
-- This ensures we don't lose any data during the conversion
CREATE TEMPORARY TABLE payment_status_backup AS
SELECT id, status FROM "Payment";

-- Step 3: Verify all existing status values are valid enum values
-- If any invalid values exist, we should handle them before proceeding
DO $$
DECLARE
    invalid_status RECORD;
BEGIN
    FOR invalid_status IN 
        SELECT DISTINCT status FROM "Payment" 
        WHERE status NOT IN ('pending', 'partially_paid', 'confirmed', 'overpaid', 'expired', 'failed', 'paid', 'completed')
        AND status IS NOT NULL
    LOOP
        RAISE EXCEPTION 'Invalid payment status found: %', invalid_status.status;
    END LOOP;
END $$;

-- Step 4: Convert the column from text to enum
-- First drop the default constraint
ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT;

-- Then convert the column type
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus" 
USING "status"::"PaymentStatus";

-- Step 5: Add the default constraint back
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'pending';

-- Step 6: Update any NULL statuses to 'pending' as a safety measure
UPDATE "Payment" SET "status" = 'pending' WHERE "status" IS NULL;

-- Step 7: Verify the migration was successful
-- This is a safety check that can be removed after confirming the migration works
SELECT 
    'Migration validation' as operation,
    COUNT(*) as total_payments,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
    COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_count,
    COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
    COUNT(CASE WHEN status = 'partially_paid' THEN 1 END) as partially_paid_count,
    COUNT(CASE WHEN status = 'overpaid' THEN 1 END) as overpaid_count,
    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
FROM "Payment";

-- Clean up the temporary table
DROP TABLE IF EXISTS payment_status_backup;
