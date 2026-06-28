-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "idempotency_key" TEXT NOT NULL,
    "user_id" TEXT,
    "request_hash" TEXT NOT NULL,
    "response_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("idempotency_key")
);

-- CreateIndex
CREATE INDEX "IdempotencyRecord_user_id_idx" ON "IdempotencyRecord"("user_id");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_created_at_idx" ON "IdempotencyRecord"("created_at");
