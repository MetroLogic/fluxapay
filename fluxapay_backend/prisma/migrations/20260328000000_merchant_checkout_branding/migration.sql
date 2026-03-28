-- Merchant branding for hosted checkout
ALTER TABLE "Merchant"
  ADD COLUMN IF NOT EXISTS "checkout_logo_url"     TEXT,
  ADD COLUMN IF NOT EXISTS "checkout_accent_color" TEXT;
