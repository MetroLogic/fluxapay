-- Migration: Add webhook event types for partial payments and overpayments
-- Issue #448: Payment monitor: handle underpayment threshold and timeout rules

-- Add enum values if they don't already exist (PostgreSQL 9.1+)
ALTER TYPE "WebhookEventType" ADD VALUE IF NOT EXISTS 'payment_partially_paid';
ALTER TYPE "WebhookEventType" ADD VALUE IF NOT EXISTS 'payment_overpaid';
