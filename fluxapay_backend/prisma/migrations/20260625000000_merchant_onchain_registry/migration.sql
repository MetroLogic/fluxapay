-- Migration: Add on-chain registry tracking fields to Merchant
-- Prevents duplicate Soroban registrations when register_merchant is retried

ALTER TABLE "Merchant"
  ADD COLUMN "onchain_registered"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onchain_registry_tx_hash" TEXT;
