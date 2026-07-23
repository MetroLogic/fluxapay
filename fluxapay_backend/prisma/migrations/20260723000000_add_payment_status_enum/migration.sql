-- Migration: add_payment_status_enum
-- Adds `refunded` and `partially_refunded` values to the PaymentStatus enum
-- so that Prisma schema, service layer, and API responses use canonical values.
-- Closes #626 – PaymentStatus enum not standardised.

-- PostgreSQL requires ALTER TYPE … ADD VALUE for enum extensions.
-- These are safe, non-destructive additions; no data migration is needed.

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'partially_refunded';
