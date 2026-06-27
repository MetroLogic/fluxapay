import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { PrismaClient, DataExportStatus } from "../generated/client/client";
import { redactEmail } from "../utils/piiRedactor";
import {
  logDataExportRequested,
  logDataExportCompleted,
  logDataExportFailed,
  logDataExportDownloaded,
} from "./audit.service";
import { getMerchantPlanFeatures, merchantHasFeature } from "./usage.service";

const prisma = new PrismaClient();

/** How long a completed export download link is valid (24 h). */
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

export const DATA_EXPORT_PII_PERMISSION = "data_export_pii";

/**
 * Ensures the authenticated merchant can only access their own data.
 * Returns 403 when merchant_id does not match the authenticated merchant.
 */
export function assertMerchantExportAccess(
  authenticatedMerchantId: string,
  requestedMerchantId: string,
  isAdmin = false,
): void {
  if (isAdmin) return;
  if (authenticatedMerchantId !== requestedMerchantId) {
    throw apiError(
      403,
      ErrorCode.FORBIDDEN,
      "You may only export data for your own merchant account.",
    );
  }
}

export async function requestDataExport(
  merchantId: string,
  requestedBy: string,
  options: { includePii?: boolean; actorId?: string } = {},
): Promise<{ jobId: string; status: DataExportStatus }> {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) {
    throw apiError(404, ErrorCode.MERCHANT_NOT_FOUND, "Merchant not found");
  }

  const features = await getMerchantPlanFeatures(merchantId);
  const includePii =
    options.includePii ??
    merchantHasFeature(features, DATA_EXPORT_PII_PERMISSION);

  const job = await prisma.dataExportJob.create({
    data: {
      merchantId,
      requested_by: requestedBy,
      expires_at: new Date(Date.now() + EXPORT_TTL_MS),
    },
  });

  await logDataExportRequested({
    actorId: options.actorId ?? merchantId,
    merchantId,
    jobId: job.id,
    requestedBy,
  });

  processExport(job.id, merchantId, includePii).catch(() => {
    // already handled inside processExport
  });

  return { jobId: job.id, status: DataExportStatus.pending };
}

export async function getExportJob(
  jobId: string,
  merchantId: string,
  authenticatedMerchantId: string,
  isAdmin = false,
) {
  assertMerchantExportAccess(authenticatedMerchantId, merchantId, isAdmin);

  const job = await prisma.dataExportJob.findFirst({
    where: { id: jobId, merchantId },
  });
  if (!job) throw apiError(404, ErrorCode.EXPORT_JOB_NOT_FOUND, "Export job not found");
  return job;
}

export async function downloadExport(
  jobId: string,
  merchantId: string,
  authenticatedMerchantId: string,
  options: { isAdmin?: boolean; actorId?: string } = {},
): Promise<object> {
  assertMerchantExportAccess(authenticatedMerchantId, merchantId, options.isAdmin);

  const job = await prisma.dataExportJob.findFirst({
    where: { id: jobId, merchantId },
  });
  if (!job) throw apiError(404, ErrorCode.EXPORT_JOB_NOT_FOUND, "Export job not found");
  if (job.status !== DataExportStatus.completed)
    throw apiError(409, ErrorCode.EXPORT_NOT_READY, `Export is not ready (status: ${job.status})`);
  if (job.expires_at < new Date())
    throw apiError(410, ErrorCode.EXPORT_EXPIRED, "Export link has expired");
  if (!job.payload) throw apiError(500, ErrorCode.EXPORT_PAYLOAD_MISSING, "Export payload missing");

  const data = JSON.parse(Buffer.from(job.payload, "base64").toString("utf8"));

  await logDataExportDownloaded({
    actorId: options.actorId ?? authenticatedMerchantId,
    merchantId,
    jobId,
    rowCount: countExportRows(data),
  });

  return data;
}

function countExportRows(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const record = data as Record<string, unknown>;
  const payments = record.payments_summary as { total?: number } | undefined;
  const webhooks = record.webhook_logs_summary as { total?: number } | undefined;
  return (payments?.total ?? 0) + (webhooks?.total ?? 0);
}

function redactExportPii<T extends Record<string, unknown>>(payload: T): T {
  const clone = JSON.parse(JSON.stringify(payload)) as T;

  const profile = clone.merchant_profile as Record<string, unknown> | undefined;
  if (profile) {
    if (typeof profile.email === "string") profile.email = redactEmail(profile.email);
    if (typeof profile.phone_number === "string") profile.phone_number = "[REDACTED]";
  }

  const payments = clone.payments_summary as { records?: Array<Record<string, unknown>> } | undefined;
  if (payments?.records) {
    payments.records = payments.records.map((p) => ({
      ...p,
      customer_email:
        typeof p.customer_email === "string" ? redactEmail(p.customer_email) : p.customer_email,
    }));
  }

  return clone;
}

async function processExport(jobId: string, merchantId: string, includePii: boolean) {
  await prisma.dataExportJob.update({
    where: { id: jobId },
    data: { status: DataExportStatus.processing },
  });

  try {
    let data: Awaited<ReturnType<typeof buildExportPayload>> = await buildExportPayload(merchantId);
    if (!includePii) {
      data = redactExportPii(data) as typeof data;
    }
    const payload = Buffer.from(JSON.stringify(data)).toString("base64");

    await prisma.dataExportJob.update({
      where: { id: jobId },
      data: { status: DataExportStatus.completed, payload },
    });

    await logDataExportCompleted({
      actorId: merchantId,
      merchantId,
      jobId,
      rowCount: countExportRows(data),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await prisma.dataExportJob.update({
      where: { id: jobId },
      data: { status: DataExportStatus.failed, error },
    });
    await logDataExportFailed({
      actorId: merchantId,
      merchantId,
      jobId,
      error,
    });
  }
}

async function buildExportPayload(merchantId: string) {
  const [merchant, payments, webhookLogs] = await Promise.all([
    prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        business_name: true,
        email: true,
        phone_number: true,
        country: true,
        settlement_currency: true,
        status: true,
        created_at: true,
        kyc: {
          select: {
            business_type: true,
            legal_business_name: true,
            country_of_registration: true,
            kyc_status: true,
            created_at: true,
          },
        },
        bankAccount: {
          select: {
            account_name: true,
            bank_name: true,
            currency: true,
            country: true,
          },
        },
      },
    }),

    prisma.payment.findMany({
      where: { merchantId },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        customer_email: true,
        description: true,
        createdAt: true,
        confirmed_at: true,
        settled_at: true,
        transaction_hash: true,
      },
      orderBy: { createdAt: "desc" },
    }),

    prisma.webhookLog.findMany({
      where: { merchantId },
      select: {
        id: true,
        event_type: true,
        endpoint_url: true,
        http_status: true,
        status: true,
        retry_count: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
      take: 1000,
    }),
  ]);

  if (!merchant) throw new Error("Merchant not found");

  return {
    exported_at: new Date().toISOString(),
    merchant_profile: merchant,
    payments_summary: {
      total: payments.length,
      records: payments,
    },
    webhook_logs_summary: {
      total: webhookLogs.length,
      records: webhookLogs,
    },
  };
}
