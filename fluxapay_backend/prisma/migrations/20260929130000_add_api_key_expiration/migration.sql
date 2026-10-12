ALTER TABLE "ApiKey" ADD COLUMN "expires_at" TIMESTAMP(3);

CREATE INDEX "ApiKey_status_expires_at_idx" ON "ApiKey"("status", "expires_at");