-- CreateEnum
CREATE TYPE "DataExportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "DataExportJob" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "status" "DataExportStatus" NOT NULL DEFAULT 'pending',
    "payload" TEXT,
    "error" TEXT,
    "requested_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataExportJob_merchantId_idx" ON "DataExportJob"("merchantId");

-- AddForeignKey
ALTER TABLE "DataExportJob" ADD CONSTRAINT "DataExportJob_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
