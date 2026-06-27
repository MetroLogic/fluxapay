-- CreateEnum
CREATE TYPE "DepositAddressStatus" AS ENUM ('available', 'assigned', 'cooldown');

-- CreateTable
CREATE TABLE "DepositAddress" (
    "id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "secret_key" TEXT NOT NULL,
    "derivation_path" TEXT NOT NULL,
    "status" "DepositAddressStatus" NOT NULL DEFAULT 'available',
    "assigned_payment_id" TEXT,
    "cooldown_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_public_key_key" ON "DepositAddress"("public_key");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_assigned_payment_id_key" ON "DepositAddress"("assigned_payment_id");

-- CreateIndex
CREATE INDEX "DepositAddress_status_idx" ON "DepositAddress"("status");

-- CreateIndex
CREATE INDEX "DepositAddress_cooldown_until_idx" ON "DepositAddress"("cooldown_until");

-- AddForeignKey
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_assigned_payment_id_fkey" FOREIGN KEY ("assigned_payment_id") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
