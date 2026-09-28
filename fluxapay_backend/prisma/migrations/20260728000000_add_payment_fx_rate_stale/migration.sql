-- Track whether the FX rate used for a payment was served stale (from cache
-- or a hardcoded fallback) because the live exchange rate API was unreachable.
-- Part of the FX circuit breaker (#823).
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "fx_rate_stale" BOOLEAN NOT NULL DEFAULT FALSE;
