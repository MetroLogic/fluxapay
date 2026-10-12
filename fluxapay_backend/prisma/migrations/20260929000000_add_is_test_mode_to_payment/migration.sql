-- Migration: Add Stripe-style test mode support
-- Issue #1102
--
-- sk_test_ API keys operate against an isolated test-mode data partition.
-- Payments created with a test key are flagged is_test_mode = true so live and
-- test data never mix in lists, exports, or read-by-id lookups.

-- Add test-mode flag to payments
ALTER TABLE "Payment" ADD COLUMN "is_test_mode" BOOLEAN NOT NULL DEFAULT false;

-- Composite index for test-mode partition queries
-- Covers: WHERE merchantId = ? AND is_test_mode = ? ORDER BY createdAt DESC
CREATE INDEX IF NOT EXISTS "Payment_merchantId_is_test_mode_createdAt_idx"
  ON "Payment"("merchantId", "is_test_mode", "createdAt" DESC);