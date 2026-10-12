-- Add per-payment sweep retry tracking so a single failed sweep no longer
-- silently vanishes into the batch's `skipped` list with no persisted state.
-- Closes #824 -- SweepService does not handle partial batch failures.

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "sweep_retry_count"         INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sweep_last_error"           TEXT,
  ADD COLUMN IF NOT EXISTS "sweep_failed_at"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sweep_needs_manual_review"  BOOLEAN   NOT NULL DEFAULT FALSE;

-- The sweep-eligibility query now also excludes payments flagged for manual
-- review, so the composite index gains that column too.
DROP INDEX IF EXISTS "Payment_swept_status_idx";
CREATE INDEX IF NOT EXISTS "Payment_swept_status_sweep_needs_manual_review_idx"
  ON "Payment"("swept", "status", "sweep_needs_manual_review");
