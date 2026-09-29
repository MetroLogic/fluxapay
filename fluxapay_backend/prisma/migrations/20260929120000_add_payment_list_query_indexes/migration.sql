-- Migration: Add indexes for the payments ("transactions") list endpoint
-- Issue #1208: slow response time on the transaction list endpoint
--
-- GET /api/v1/payments builds a WHERE clause of merchantId plus any combination
-- of is_test_mode, status, currency, createdAt range, and a customer_email/id
-- search, then orders by the requested sort column. The existing indexes covered
-- merchantId, merchantId+status and merchantId+is_test_mode, but the currency
-- filter and the status+currency combination had no supporting index, so those
-- list requests degraded to a per-merchant scan plus an explicit sort once a
-- merchant accumulated a large number of payments.
--
-- All statements are additive (CREATE INDEX IF NOT EXISTS) and pass the
-- migration safety gate.

-- ─── Payment indexes ──────────────────────────────────────────────────────────

-- Currency-scoped lists: WHERE merchantId = ? AND currency = ?
--   ORDER BY createdAt DESC
CREATE INDEX IF NOT EXISTS "Payment_merchantId_currency_createdAt_idx"
  ON "Payment"("merchantId", "currency", "createdAt" DESC);

-- Status + currency lists (the payments dashboard default view):
--   WHERE merchantId = ? AND status = ? AND currency = ?
--   ORDER BY createdAt DESC
CREATE INDEX IF NOT EXISTS "Payment_merchantId_status_currency_createdAt_idx"
  ON "Payment"("merchantId", "status", "currency", "createdAt" DESC);

-- Test-mode aware status lists with a date_from/date_to range:
--   WHERE merchantId = ? AND is_test_mode = ? AND status = ?
--     AND createdAt BETWEEN ? AND ?
--   ORDER BY createdAt DESC
CREATE INDEX IF NOT EXISTS "Payment_merchantId_is_test_mode_status_createdAt_idx"
  ON "Payment"("merchantId", "is_test_mode", "status", "createdAt" DESC);

-- Backs the customer_email arm of the `search` filter so the lookup is not a
-- full scan of the merchant's rows.
CREATE INDEX IF NOT EXISTS "Payment_merchantId_customer_email_idx"
  ON "Payment"("merchantId", "customer_email");
