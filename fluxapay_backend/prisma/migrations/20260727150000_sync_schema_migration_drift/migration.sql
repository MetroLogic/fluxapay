-- CreateEnum
CREATE TYPE "ApiKeyEnvironment" AS ENUM ('live', 'test');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('pending', 'active', 'released', 'refunded', 'expired');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditActionType" ADD VALUE 'kyc_decision';
ALTER TYPE "AuditActionType" ADD VALUE 'sweep_operation';
ALTER TYPE "AuditActionType" ADD VALUE 'settlement_batch';
ALTER TYPE "AuditActionType" ADD VALUE 'merchant_profile_updated';
ALTER TYPE "AuditActionType" ADD VALUE 'bank_account_updated';
ALTER TYPE "AuditActionType" ADD VALUE 'api_key_rotated';
ALTER TYPE "AuditActionType" ADD VALUE 'webhook_secret_rotated';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntityType" ADD VALUE 'merchant';
ALTER TYPE "AuditEntityType" ADD VALUE 'payment_gateway';
ALTER TYPE "AuditEntityType" ADD VALUE 'settlement';
ALTER TYPE "AuditEntityType" ADD VALUE 'bank_account';
ALTER TYPE "AuditEntityType" ADD VALUE 'api_key';
ALTER TYPE "AuditEntityType" ADD VALUE 'webhook_secret';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WebhookEventType" ADD VALUE 'payment_confirmed';
ALTER TYPE "WebhookEventType" ADD VALUE 'payment_expired';
ALTER TYPE "WebhookEventType" ADD VALUE 'payment_settled';
ALTER TYPE "WebhookEventType" ADD VALUE 'settlement_completed';
ALTER TYPE "WebhookEventType" ADD VALUE 'settlement_failed';
ALTER TYPE "WebhookEventType" ADD VALUE 'invoice_paid';
ALTER TYPE "WebhookEventType" ADD VALUE 'invoice_overdue';
ALTER TYPE "WebhookEventType" ADD VALUE 'payment_escrow_released';
ALTER TYPE "WebhookEventType" ADD VALUE 'payment_escrow_refunded';
ALTER TYPE "WebhookEventType" ADD VALUE 'payment_escrow_expired';

-- DropIndex
DROP INDEX "AuditLog_action_type_idx";

-- DropIndex
DROP INDEX "AuditLog_admin_id_idx";

-- DropIndex
DROP INDEX "AuditLog_created_at_idx";

-- DropIndex
DROP INDEX "AuditLog_entity_id_idx";

-- DropIndex
DROP INDEX "DepositAddress_cooldown_until_idx";

-- DropIndex
DROP INDEX "DepositAddress_status_idx";

-- DropIndex
DROP INDEX "IdempotencyRecord_created_at_idx";

-- DropIndex
DROP INDEX "IdempotencyRecord_user_id_idx";

-- DropIndex
DROP INDEX "WebhookLog_event_type_idx";

-- DropIndex
DROP INDEX "WebhookLog_merchantId_idx";

-- DropIndex
DROP INDEX "WebhookLog_payment_id_idx";

-- DropIndex
DROP INDEX "WebhookLog_status_idx";

-- DropIndex
DROP INDEX "WebhookRetryAttempt_webhookLogId_idx";

-- AlterTable
ALTER TABLE "ApiKey" DROP COLUMN "environment",
ADD COLUMN     "environment" "ApiKeyEnvironment" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ApiKeyStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "stellar_address" TEXT;

-- AlterTable
ALTER TABLE "Merchant" ALTER COLUMN "webhook_secret" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WebhookLog" ALTER COLUMN "request_payload" DROP NOT NULL,
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "max_retries" SET DEFAULT 5;

-- CreateIndex
CREATE INDEX "ApiKey_merchantId_status_idx" ON "ApiKey"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Customer_deleted_at_idx" ON "Customer"("deleted_at");

-- CreateIndex
CREATE INDEX "DepositAddress_status_cooldown_until_idx" ON "DepositAddress"("status", "cooldown_until");

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

