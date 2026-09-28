-- Track the plan amount actually applied to each subscription's current
-- period, so renewals can detect and apply plan price changes instead of
-- indefinitely reusing whatever was charged historically, and so a
-- price-increase notice can be sent once, 7 days before the renewal that
-- would apply it.
ALTER TABLE "MerchantSubscription"
  ADD COLUMN "current_period_amount" DECIMAL(65,30),
  ADD COLUMN "price_change_notice_sent_at" TIMESTAMP(3);
