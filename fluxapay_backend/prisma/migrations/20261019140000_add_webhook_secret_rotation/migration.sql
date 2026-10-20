-- Migration: Add secondary webhook secret fields for key rotation support
-- Supports dual-signing during grace window (issue #1343)

ALTER TABLE "Merchant" ADD COLUMN "webhook_secret_secondary" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "webhook_secret_secondary_created_at" TIMESTAMP(3);
