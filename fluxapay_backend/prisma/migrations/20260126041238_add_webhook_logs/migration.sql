-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('pending_verification', 'active');

-- CreateEnum
CREATE TYPE "OTPChannel" AS ENUM ('email', 'phone');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('payment_completed', 'payment_failed', 'payment_pending', 'refund_completed', 'refund_failed', 'subscription_created', 'subscription_cancelled', 'subscription_renewed');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('pending', 'delivered', 'failed', 'retrying');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "settlement_currency" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" "MerchantStatus" NOT NULL DEFAULT 'pending_verification',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OTP" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channel" "OTPChannel" NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OTP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "event_type" "WebhookEventType" NOT NULL,
    "endpoint_url" TEXT NOT NULL,
    "request_payload" JSONB NOT NULL,
    "response_body" TEXT,
    "http_status" INTEGER,
    "status" "WebhookStatus" NOT NULL DEFAULT 'pending',
    "payment_id" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookRetryAttempt" (
    "id" TEXT NOT NULL,
    "webhookLogId" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "http_status" INTEGER,
    "response_body" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookRetryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_phone_number_key" ON "Merchant"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "OTP_merchantId_channel_key" ON "OTP"("merchantId", "channel");

-- CreateIndex
CREATE INDEX "WebhookLog_merchantId_idx" ON "WebhookLog"("merchantId");

-- CreateIndex
CREATE INDEX "WebhookLog_event_type_idx" ON "WebhookLog"("event_type");

-- CreateIndex
CREATE INDEX "WebhookLog_status_idx" ON "WebhookLog"("status");

-- CreateIndex
CREATE INDEX "WebhookLog_payment_id_idx" ON "WebhookLog"("payment_id");

-- CreateIndex
CREATE INDEX "WebhookRetryAttempt_webhookLogId_idx" ON "WebhookRetryAttempt"("webhookLogId");

-- AddForeignKey
ALTER TABLE "OTP" ADD CONSTRAINT "OTP_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookRetryAttempt" ADD CONSTRAINT "WebhookRetryAttempt_webhookLogId_fkey" FOREIGN KEY ("webhookLogId") REFERENCES "WebhookLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
