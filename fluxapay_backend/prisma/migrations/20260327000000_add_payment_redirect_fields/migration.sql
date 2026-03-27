-- Add redirect URL fields and description to Payment table
ALTER TABLE "Payment" ADD COLUMN "description" TEXT;
ALTER TABLE "Payment" ADD COLUMN "success_url" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cancel_url" TEXT;
