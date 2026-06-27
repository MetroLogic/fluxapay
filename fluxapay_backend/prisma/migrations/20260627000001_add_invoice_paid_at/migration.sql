-- Add paid_at field to Invoice model
ALTER TABLE "Invoice" ADD COLUMN "paid_at" TIMESTAMP(3);
