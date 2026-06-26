Migration to add unique constraint on Customer(merchantId, email).

This migration was generated manually. Run `npx prisma migrate dev` to create and apply a proper migration in a dev environment.

SQL (Postgres):

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_merchantId_email_key" UNIQUE ("merchantId", "email");
