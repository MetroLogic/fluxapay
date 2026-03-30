import { PrismaClient, DataExportStatus } from "../generated/client/client";

const prisma = new PrismaClient();

/** How long a completed export download link is valid (24 h). */
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Enqueue a new export job and immediately process it synchronously.
 * For large datasets this can be moved to a background worker; the
 * job record + status field already supports that pattern.
 */
export async function requestDataExport(
  merchantId: string,
  requestedBy: string,
): Promise<{ jobId: string; status: DataExportStatus }> {
  const job = await prisma.dataExportJob.create({
    data: {
      merchantId,
      requested_by: requestedBy,
      expires_at: new Date(Date.now() + EXPORT_TTL_MS),
    },
  });

  // Process inline (async-safe — errors are caught and stored on the job)
  processExport(job.id, merchantId).catch(() => {
    // already handled inside processExport
  });

  return { jobId: job.id, status: DataExportStatus.pending };
}

export async function getExportJob(jobId: string, merchantId: string) {
  const job = await prisma.dataExportJob.findFirst({
    where: { id: jobId, merchantId },
  });
  if (!job) throw { status: 404, message: "Export job not found" };
  return job;
}

/**
 * Return the decoded JSON payload for a completed job.
 * Validates ownership and expiry.
 */
export async function downloadExport(
  jobId: string,
  merchantId: string,
): Promise<object> {
  const job = await prisma.dataExportJob.findFirst({
    where: { id: jobId, merchantId },
  });
  if (!job) throw { status: 404, message: "Export job not found" };
  if (job.status !== DataExportStatus.completed)
    throw { status: 409, message: `Export is not ready (status: ${job.status})` };
  if (job.expires_at < new Date())
    throw { status: 410, message: "Export link has expired" };
  if (!job.payload) throw { status: 500, message: "Export payload missing" };

  return JSON.parse(Buffer.from(job.payload, "base64").toString("utf8"));
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function processExport(jobId: string, merchantId: string) {
  await prisma.dataExportJob.update({
    where: { id: jobId },
    data: { status: DataExportStatus.processing },
  });

  try {
    const data = await buildExportPayload(merchantId);
    const payload = Buffer.from(JSON.stringify(data)).toString("base64");

    await prisma.dataExportJob.update({
      where: { id: jobId },
      data: { status: DataExportStatus.completed, payload },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await prisma.dataExportJob.update({
      where: { id: jobId },
      data: { status: DataExportStatus.failed, error },
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
      take: 1000, // cap for large merchants
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
