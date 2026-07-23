-- Add unique constraint on Customer(merchantId, email)
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_merchantId_email_key" UNIQUE ("merchantId", "email");
