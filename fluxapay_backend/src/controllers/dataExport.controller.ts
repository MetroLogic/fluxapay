import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Response } from "express";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import {
  requestDataExport,
  getExportJob,
  downloadExport,
  downloadExportCsv,
  assertMerchantExportAccess,
} from "../services/dataExport.service";

/**
 * POST /api/v1/merchants/export
 * Merchant self-service: enqueue a data export for the authenticated merchant.
 */
export async function requestExport(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const queryMerchantId = req.query.merchant_id as string | undefined;
    if (queryMerchantId) {
      assertMerchantExportAccess(merchantId, queryMerchantId);
    }
    const result = await requestDataExport(merchantId, "merchant", { actorId: merchantId });
    res.status(202).json({
      message: "Export job queued. Poll /export/:jobId for status.",
      ...result,
    });
  } catch (err: unknown) {
    sendApiError(res, err);
  }
}

/**
 * GET /api/v1/merchants/export/:jobId
 * Poll job status.
 */
export async function getExportStatus(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const queryMerchantId = (req.query.merchant_id as string) ?? merchantId;
    assertMerchantExportAccess(merchantId, queryMerchantId);

    const job = await getExportJob(
      req.params.jobId as string,
      queryMerchantId,
      merchantId,
    );
    res.json({
      jobId: job.id,
      status: job.status,
      expires_at: job.expires_at,
      error: job.error ?? undefined,
    });
  } catch (err: unknown) {
    sendApiError(res, err);
  }
}

/**
 * GET /api/v1/merchants/export/:jobId/download
 * Download the completed export as JSON. Supports ?format=csv for CSV export.
 */
export async function downloadExportHandler(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const queryMerchantId = (req.query.merchant_id as string) ?? merchantId;
    assertMerchantExportAccess(merchantId, queryMerchantId);

    const format = (req.query.format as string | undefined) ?? "json";
    const jobId = req.params.jobId as string;

    if (format === "csv") {
      const csv = await downloadExportCsv(jobId, queryMerchantId, merchantId, {
        actorId: merchantId,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="export-${jobId}.csv"`);
      return res.send(csv);
    }

    const data = await downloadExport(jobId, queryMerchantId, merchantId, {
      actorId: merchantId,
    });
    res.setHeader("Content-Disposition", `attachment; filename="export-${jobId}.json`);
    res.json(data);
  } catch (err: unknown) {
    sendApiError(res, err);
  }
}

/**
 * POST /api/v1/merchants/export/admin/:merchantId
 * Admin-triggered export on behalf of a merchant (cross-merchant, RBAC-guarded).
 */
export async function adminRequestExport(req: AuthRequest, res: Response) {
  try {
    const { merchantId } = req.params as Record<string, string>;
    const adminId = req.adminUser?.id ?? req.user?.id ?? "admin";
    const result = await requestDataExport(merchantId, `admin:${adminId}`, {
      includePii: true,
      actorId: adminId,
    });
    res.status(202).json({
      message: "Export job queued.",
      ...result,
    });
  } catch (err: unknown) {
    sendApiError(res, err);
  }
}

/**
 * GET /api/v1/merchants/export/admin/:merchantId/:jobId/download
 * Admin download of a completed export. Supports ?format=csv.
 */
export async function adminDownloadExport(req: AuthRequest, res: Response) {
  try {
    const { merchantId, jobId } = req.params as Record<string, string>;
    const adminId = req.adminUser?.id ?? req.user?.id ?? "admin";
    const format = (req.query.format as string | undefined) ?? "json";

    if (format === "csv") {
      const csv = await downloadExportCsv(jobId, merchantId, merchantId, {
        isAdmin: true,
        actorId: adminId,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="export-${jobId}.csv"`);
      return res.send(csv);
    }

    const data = await downloadExport(jobId, merchantId, merchantId, {
      isAdmin: true,
      actorId: adminId,
    });
    res.setHeader("Content-Disposition", `attachment; filename="export-${jobId}.json"`);
    res.json(data);
  } catch (err: unknown) {
    sendApiError(res, err);
  }
}
