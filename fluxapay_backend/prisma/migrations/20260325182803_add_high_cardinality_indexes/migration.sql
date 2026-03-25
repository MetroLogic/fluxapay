-- Add composite indexes for high-cardinality queries on Payment, Invoice, and WebhookLog tables
-- These indexes optimize list endpoints and admin dashboard queries that filter by merchantId and created/createdAt timestamps

-- Add composite index on Payment(merchantId, createdAt) for efficient merchant payment list queries
CREATE INDEX "Payment_merchantId_createdAt_idx" ON "Payment"("merchantId", "createdAt" DESC);

-- Add composite index on Invoice(merchantId, created_at) for efficient merchant invoice list queries
CREATE INDEX "Invoice_merchantId_created_at_idx" ON "Invoice"("merchantId", "created_at" DESC);

-- Add composite index on WebhookLog(merchantId, created_at) for efficient merchant webhook log list queries
CREATE INDEX "WebhookLog_merchantId_created_at_idx" ON "WebhookLog"("merchantId", "created_at" DESC);
