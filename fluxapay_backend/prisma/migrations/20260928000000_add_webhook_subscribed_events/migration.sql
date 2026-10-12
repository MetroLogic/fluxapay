-- AddColumn: webhook_subscribed_events on Merchant
-- Stores optional event-type filter list. Empty array = all events (backward-compatible default).
ALTER TABLE "Merchant" ADD COLUMN "webhook_subscribed_events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
