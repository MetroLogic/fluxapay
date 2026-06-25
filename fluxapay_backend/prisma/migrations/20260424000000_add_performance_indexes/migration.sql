-- Migration: Add performance indexes for high-volume transaction queries
-- Issue #386: Database Index Optimization
--
-- Analysis of slow query patterns:
--   1. Payment list filtered by merchantId + status (e.g. pending payments dashboard)
--   2. Payment list filtered by merchantId + created_at range (date range reports)
--   3. Settlement list filtered by merchantId + status
--   4. Refund list filtered by merchantId + status
--   5. AuditLog filtered by admin_id (merchant-scoped audit log dashboard)
--   6. AuditLog filtered by entity_id (lookup by merchant/entity)
--   7. Payment filtered by status alone (sweep worker queries)
--   8. WebhookLog filtered by merchantId + status (retry worker)

-- ─── Payment indexes ──────────────────────────────────────────────────────────

-- Composite index: merchantId + status + createdAt for filtered payment lists
-- Covers: WHERE merchantId = ? AND status = ? ORDER BY createdAt DESC
CREATE INDEX IF NOT EXISTS "Payment_merchantId_status_createdAt_idx"
  ON "Payment"("merchantId", "status", "createdAt" DESC);

-- Index on status alone for sweep worker (WHERE swept = false AND status = 'confirmed')
-- Note: (swept, status) index already exists; add status + swept_at for sweep scheduling
CREATE INDEX IF NOT EXISTS "Payment_status_swept_at_idx"
  ON "Payment"("status", "swept_at" DESC)
  WHERE "swept" = false;

-- ─── Settlement indexes ───────────────────────────────────────────────────────

-- Composite index: merchantId + status for settlement list queries
CREATE INDEX IF NOT EXISTS "Settlement_merchantId_status_idx"
  ON "Settlement"("merchantId", "status");

-- Composite index: merchantId + scheduled_date for settlement scheduling
CREATE INDEX IF NOT EXISTS "Settlement_merchantId_scheduled_date_idx"
  ON "Settlement"("merchantId", "scheduled_date" DESC);

-- ─── Refund indexes ───────────────────────────────────────────────────────────

-- Composite index: merchantId + status + created_at for refund list queries
CREATE INDEX IF NOT EXISTS "Refund_merchantId_status_created_at_idx"
  ON "Refund"("merchantId", "status", "created_at" DESC);

-- ─── AuditLog indexes ─────────────────────────────────────────────────────────

-- Index on admin_id + created_at for merchant-scoped audit log dashboard
CREATE INDEX IF NOT EXISTS "AuditLog_admin_id_created_at_idx"
  ON "AuditLog"("admin_id", "created_at" DESC);

-- Index on entity_id + action_type for entity-specific audit lookups
CREATE INDEX IF NOT EXISTS "AuditLog_entity_id_action_type_idx"
  ON "AuditLog"("entity_id", "action_type");

-- ─── WebhookLog indexes ───────────────────────────────────────────────────────

-- Composite index: merchantId + status for retry worker queries
CREATE INDEX IF NOT EXISTS "WebhookLog_merchantId_status_idx"
  ON "WebhookLog"("merchantId", "status");

-- ─── Invoice indexes ──────────────────────────────────────────────────────────

-- Composite index: merchantId + status + created_at for invoice list queries
CREATE INDEX IF NOT EXISTS "Invoice_merchantId_status_created_at_idx"
  ON "Invoice"("merchantId", "status", "created_at" DESC);
