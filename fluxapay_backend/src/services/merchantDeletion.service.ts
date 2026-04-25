/**
 * Merchant account deletion / anonymization service.
 *
 * Retention policy (legal hold):
 *   - Payment, Settlement, Refund, Invoice, AuditLog records are KEPT
 *     (financial / regulatory obligation — typically 7 years).
 *   - PII fields on Merchant are overwritten with anonymized placeholders.
 *   - Webhook logs endpoint URL is cleared (may contain PII).
 *   - KYC documents are deleted; KYC record is anonymized.
 *   - OTPs, BankAccount, Customers, Subscriptions are hard-deleted.
 *   - An AuditLog entry is written for both the request and the execution.
 */
import { PrismaClient, AuditActionType, AuditEntityType } from "../generated/client/client";

const prisma = new PrismaClient();

const ANON_EMAIL = (id: string) => `deleted-${id}@anonymized.invalid`;
const ANON_PHONE = (id: string) => `+000000${id.slice(-6)}`;
const ANON_NAME = "Anonymized Account";

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
  if (!merchant) throw { status: 404, message: "Merchant not found" };
  if (merchant.anonymized_at) throw { status: 409, message: "Account already anonymized" };

  // Upsert so re-requests are idempotent
  const req = await prisma.merchantDeletionRequest.upsert({
    where: { merchantId },
    create: { merchantId, reason, requested_by: requestedBy },
    update: { reason, requested_by: requestedBy, executed_at: null },
  });

  // Mark merchant as pending deletion
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { deletion_requested_at: new Date() },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      admin_id: requestedBy,
      action_type: AuditActionType.merchant_deletion_requested,
      entity_type: AuditEntityType.merchant_account,
      entity_id: merchantId,
      details: {
        reason: reason ?? null,
        requested_by: requestedBy,
        requested_at: new Date().toISOString(),
      },
    },
  });

  return { requestId: req.id };
}

/**
 * Execute anonymization (admin-only step 2).
 *
 * Financial records (payments, settlements, refunds, invoices) are retained.
 * PII is overwritten. Hard-deletes non-financial data.
 */
export async function executeDeletion(
  merchantId: string,
  adminId: string,
): Promise<void> {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw { status: 404, message: "Merchant not found" };
  if (merchant.anonymized_at) throw { status: 409, message: "Account already anonymized" };

  const deletionReq = await prisma.merchantDeletionRequest.findUnique({
    where: { merchantId },
  });
  if (!deletionReq) throw { status: 400, message: "No deletion request found for this merchant" };

  await prisma.$transaction(async (tx) => {
    // 1. Anonymize Merchant PII
    await tx.merchant.update({
      where: { id: merchantId },
      data: {
        business_name: ANON_NAME,
        email: ANON_EMAIL(merchantId),
        phone_number: ANON_PHONE(merchantId),
        password: "REDACTED",
        webhook_url: null,
        webhook_secret: "REDACTED",
        api_key_hashed: null,
        api_key_last_four: null,
        checkout_logo_url: null,
        checkout_accent_color: null,
        anonymized_at: new Date(),
      },
    });

    // 2. Anonymize KYC record (keep for audit trail, wipe PII)
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

    // 3. Delete KYC documents (files already on Cloudinary — caller must purge separately)
    await tx.kYCDocument.deleteMany({ where: { kyc: { merchantId } } });

    // 4. Clear webhook log endpoint URLs (may contain PII in query params)
    await tx.webhookLog.updateMany({
      where: { merchantId },
      data: { endpoint_url: "REDACTED" },
    });

    // 5. Hard-delete non-financial / session data
    await tx.oTP.deleteMany({ where: { merchantId } });
    await tx.bankAccount.deleteMany({ where: { merchantId } });
    await tx.merchantSubscription.deleteMany({ where: { merchantId } });
    await tx.customer.deleteMany({ where: { merchantId } });

    // 6. Mark deletion request as executed
    await tx.merchantDeletionRequest.update({
      where: { merchantId },
      data: { executed_at: new Date() },
    });

    // 7. Audit log
    await tx.auditLog.create({
      data: {
        admin_id: adminId,
        action_type: AuditActionType.merchant_anonymized,
        entity_type: AuditEntityType.merchant_account,
        entity_id: merchantId,
        details: {
          executed_by: adminId,
          executed_at: new Date().toISOString(),
          retained: ["payments", "settlements", "refunds", "invoices", "audit_logs"],
          deleted: ["otps", "bank_account", "subscriptions", "customers", "kyc_documents"],
          anonymized: ["merchant_profile", "kyc_record", "webhook_log_urls"],
        },
      },
    });
  });
}

export async function getDeletionRequest(merchantId: string) {
  const req = await prisma.merchantDeletionRequest.findUnique({ where: { merchantId } });
  if (!req) throw { status: 404, message: "No deletion request found" };
  return req;
}
