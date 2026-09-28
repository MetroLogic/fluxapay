-- Add redirect URL fields and description to Payment table
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "success_url" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancel_url" TEXT;
