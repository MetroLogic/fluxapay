import { Response } from "express";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import {
  requestDataExport,
  getExportJob,
  downloadExport,
} from "../services/dataExport.service";

/**
 * POST /api/v1/merchants/export
 * Merchant self-service: enqueue a data export for the authenticated merchant.
 */
export async function requestExport(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await requestDataExport(merchantId, "merchant");
    res.status(202).json({
      message: "Export job queued. Poll /export/:jobId for status.",
      ...result,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * GET /api/v1/merchants/export/:jobId
 * Poll job status.
 */
export async function getExportStatus(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const job = await getExportJob(req.params.jobId as string, merchantId);
    res.json({
      jobId: job.id,
      status: job.status,
      expires_at: job.expires_at,
      error: job.error ?? undefined,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * GET /api/v1/merchants/export/:jobId/download
 * Download the completed export as JSON.
 */
export async function downloadExportHandler(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const data = await downloadExport(req.params.jobId as string, merchantId);
    res.setHeader("Content-Disposition", `attachment; filename="export-${req.params.jobId as string}.json"`);
    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * POST /api/v1/admin/merchants/:merchantId/export
 * Admin-triggered export on behalf of a merchant.
 */
export async function adminRequestExport(req: AuthRequest, res: Response) {
  try {
    const { merchantId } = req.params as Record<string, string>;
    const adminId = req.adminUser?.id ?? req.user?.id ?? "admin";
    const result = await requestDataExport(merchantId, `admin:${adminId}`);
    res.status(202).json({
      message: "Export job queued.",
      ...result,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * GET /api/v1/admin/merchants/:merchantId/export/:jobId/download
 * Admin download of a completed export.
 */
export async function adminDownloadExport(req: AuthRequest, res: Response) {
  try {
    const { merchantId, jobId } = req.params as Record<string, string>;
    const data = await downloadExport(jobId, merchantId);
    res.setHeader("Content-Disposition", `attachment; filename="export-${jobId}.json"`);
    res.json(data);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}
