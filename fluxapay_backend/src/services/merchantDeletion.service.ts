import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
/**
 * Merchant account deletion / anonymization service.
 *
 * Retention policy (legal hold):
 *   - Payment, Settlement, Refund, Invoice, AuditLog records are KEPT
 *     (financial / regulatory obligation — typically 7 years).
 *   - PII fields on Merchant are overwritten with anonymized placeholders.
 *   - Active API keys are revoked; webhook endpoints deactivated.
 *   - Pending webhook deliveries are cancelled; active charges cancelled.
 *   - KYC documents are purged from Cloudinary then deleted from DB; KYC record is anonymized.
 *   - OTPs, BankAccount, Customers, Subscriptions are hard-deleted.
 */
import {
  logMerchantDeleted,
  logApiKeysRevoked,
  logWebhooksDeactivated,
  logChargesCancelled,
} from "./audit.service";
import { deleteFromCloudinary } from "./cloudinary.service";
import { getLogger } from "../utils/logger";

const logger = getLogger();

import { prisma } from "../prisma";

const ANON_EMAIL = (id: string) => `deleted-${id}@anonymized.invalid`;
const ANON_PHONE = (id: string) => `+000000${id.slice(-6)}`;
const ANON_NAME = "Anonymized Account";

const ACTIVE_CHARGE_STATUSES = ["pending", "partially_paid"] as const;
const PENDING_WEBHOOK_STATUSES = ["pending", "retrying"] as const;

/**
 * Record a deletion request (step 1 — merchant self-service or admin).
 * Does NOT anonymize yet; an admin must approve via executeDeletion().
 */
export async function requestDeletion(
  merchantId: string,
  requestedBy: string,
  reason?: string,
): Promise<{ requestId: string }> {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw apiError(404, ErrorCode.MERCHANT_NOT_FOUND, "Merchant not found");
  if (merchant.anonymized_at) throw apiError(409, ErrorCode.ACCOUNT_ALREADY_ANONYMIZED, "Account already anonymized");

  const req = await prisma.merchantDeletionRequest.upsert({
    where: { merchantId },
    create: { merchantId, reason, requested_by: requestedBy },
    update: { reason, requested_by: requestedBy, executed_at: null },
  });

  await prisma.merchant.update({
    where: { id: merchantId },
    data: { deletion_requested_at: new Date() },
  });

  return { requestId: req.id };
}

/**
 * Execute anonymization (admin-only step 2).
 *
 * Financial records (payments, settlements, refunds, invoices) are retained.
 * PII is overwritten. Cascades revoke keys, deactivate webhooks, cancel charges.
 *
 * @param force - When true, skip the in-flight settlement guard (use with care).
 */
export async function executeDeletion(
  merchantId: string,
  adminId: string,
  force = false,
): Promise<void> {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw apiError(404, ErrorCode.MERCHANT_NOT_FOUND, "Merchant not found");
  if (merchant.anonymized_at) throw apiError(409, ErrorCode.ACCOUNT_ALREADY_ANONYMIZED, "Account already anonymized");

  const deletionReq = await prisma.merchantDeletionRequest.findUnique({
    where: { merchantId },
  });
  if (!deletionReq) throw apiError(400, ErrorCode.NO_DELETION_REQUEST, "No deletion request found for this merchant");

  // Guard: refuse if any settlements are still in progress unless force=true.
  if (!force) {
    const inflightSettlements = await prisma.settlement.findMany({
      where: {
        merchantId,
        status: { in: ["pending", "processing"] },
      },
      select: { id: true, status: true },
    });

    if (inflightSettlements.length > 0) {
      const ids = inflightSettlements.map((s) => s.id).join(", ");
      logger.warn("executeDeletion blocked — in-flight settlements exist", {
        event: "deletion_blocked_inflight_settlements",
        merchantId,
        settlementIds: ids,
      });
      throw apiError(
        409,
        ErrorCode.INFLIGHT_SETTLEMENTS,
        `Cannot delete merchant while settlements are in progress. ` +
          `Pending/processing settlement IDs: ${ids}. ` +
          `Wait for them to complete or use force=true to override.`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Revoke all active API keys
    const revokedKeys = await tx.apiKey.updateMany({
      where: { merchantId, status: "active" },
      data: { status: "revoked" },
    });

    // 2. Deactivate webhook endpoint and cancel pending deliveries
    await tx.merchant.update({
      where: { id: merchantId },
      data: {
        webhook_url: null,
        webhook_secret: "REDACTED",
      },
    });

    const cancelledWebhooks = await tx.webhookLog.updateMany({
      where: {
        merchantId,
        status: { in: [...PENDING_WEBHOOK_STATUSES] },
      },
      data: {
        status: "failed",
        failure_reason: "merchant_deleted",
        next_retry_at: null,
        failed_at: new Date(),
      },
    });

    // 3. Cancel active payment charges
    const cancelledCharges = await tx.payment.updateMany({
      where: {
        merchantId,
        status: { in: [...ACTIVE_CHARGE_STATUSES] },
      },
      data: { status: "cancelled" },
    });

    // 4. Anonymize Merchant PII
    await tx.merchant.update({
      where: { id: merchantId },
      data: {
        business_name: ANON_NAME,
        email: ANON_EMAIL(merchantId),
        phone_number: ANON_PHONE(merchantId),
        password: "REDACTED",
        api_key_hashed: null,
        api_key_last_four: null,
        checkout_logo_url: null,
        checkout_accent_color: null,
        anonymized_at: new Date(),
      },
    });

    // 5. Anonymize KYC record (keep for audit trail, wipe PII)
    await tx.merchantKYC.updateMany({
      where: { merchantId },
      data: {
        legal_business_name: ANON_NAME,
        director_full_name: ANON_NAME,
        director_email: ANON_EMAIL(merchantId),
        director_phone: ANON_PHONE(merchantId),
        government_id_number: "REDACTED",
        business_registration_number: null,
        business_address: "REDACTED",
      },
    });

    // 6. Purge KYC document files from Cloudinary, then delete DB records.
    //    Query public_ids BEFORE the transaction deletes the rows.
    const kycDocs = await tx.kYCDocument.findMany({
      where: { kyc: { merchantId } },
      select: { id: true, public_id: true },
    });

    // Purge each file from Cloudinary; log failures so operators can reconcile.
    const cloudinaryResults = await Promise.allSettled(
      kycDocs.map((doc) => deleteFromCloudinary(doc.public_id)),
    );
    cloudinaryResults.forEach((result, idx) => {
      if (result.status === "rejected") {
        logger.error("ALERT: Cloudinary KYC document purge failed — manual reconciliation required", {
          event: "cloudinary_purge_failed",
          merchantId,
          docId: kycDocs[idx]?.id,
          public_id: kycDocs[idx]?.public_id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    // Delete the DB rows regardless of Cloudinary outcome (PII must be removed).
    await tx.kYCDocument.deleteMany({ where: { kyc: { merchantId } } });

    // 7. Clear webhook log endpoint URLs (may contain PII in query params)
    await tx.webhookLog.updateMany({
      where: { merchantId },
      data: { endpoint_url: "REDACTED" },
    });

    // 8. Hard-delete non-financial / session data
    await tx.oTP.deleteMany({ where: { merchantId } });
    await tx.bankAccount.deleteMany({ where: { merchantId } });
    await tx.merchantSubscription.deleteMany({ where: { merchantId } });
    await tx.customer.deleteMany({ where: { merchantId } });
    await tx.refreshToken.deleteMany({ where: { merchantId } });

    // 9. Mark deletion request as executed
    await tx.merchantDeletionRequest.update({
      where: { merchantId },
      data: { executed_at: new Date() },
    });

    // 10. Audit events for each cascaded action
    await logMerchantDeleted(
      {
        adminId,
        merchantId,
        reason: deletionReq.reason ?? undefined,
      },
      tx,
    );

    if (revokedKeys.count > 0) {
      await logApiKeysRevoked(
        { adminId, merchantId, revokedCount: revokedKeys.count },
        tx,
      );
    }

    if (cancelledWebhooks.count > 0) {
      await logWebhooksDeactivated(
        { adminId, merchantId, cancelledDeliveryCount: cancelledWebhooks.count },
        tx,
      );
    }

    if (cancelledCharges.count > 0) {
      await logChargesCancelled(
        { adminId, merchantId, cancelledCount: cancelledCharges.count },
        tx,
      );
    }
  });
}

export async function getDeletionRequest(merchantId: string) {
  const req = await prisma.merchantDeletionRequest.findUnique({ where: { merchantId } });
  if (!req) throw apiError(404, ErrorCode.DELETION_REQUEST_NOT_FOUND, "No deletion request found");
  return req;
}
