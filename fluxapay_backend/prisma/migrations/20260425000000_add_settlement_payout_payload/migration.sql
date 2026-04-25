-- AddColumn: payout_partner_payload on Settlement for audit trail (#420)
-- Stores sanitized JSON payload from the exchange partner for support & reconciliation.
-- The field is nullable – existing settlements that predate this migration have NULL.

ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "payout_partner_payload" JSONB;
