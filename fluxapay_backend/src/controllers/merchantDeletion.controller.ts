import { Response } from "express";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import {
  requestDeletion,
  executeDeletion,
  getDeletionRequest,
} from "../services/merchantDeletion.service";

/**
 * POST /api/v1/merchants/me/deletion-request
 * Merchant self-service: submit a right-to-erasure request.
 */
export async function selfRequestDeletion(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { reason } = req.body ?? {};
    const result = await requestDeletion(merchantId, "merchant", reason);
    res.status(202).json({
      message: "Deletion request recorded. An admin will review and execute anonymization.",
      ...result,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * GET /api/v1/merchants/me/deletion-request
 * Merchant: check status of their deletion request.
 */
export async function selfGetDeletionRequest(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const request = await getDeletionRequest(merchantId);
    res.json(request);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * POST /api/v1/admin/merchants/:merchantId/deletion-request
 * Admin: submit a deletion request on behalf of a merchant.
 */
export async function adminRequestDeletion(req: AuthRequest, res: Response) {
  try {
    const { merchantId } = req.params as Record<string, string>;
    const adminId = req.user?.id ?? "admin";
    const { reason } = req.body ?? {};
    const result = await requestDeletion(merchantId, `admin:${adminId}`, reason);
    res.status(202).json({ message: "Deletion request recorded.", ...result });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * POST /api/v1/admin/merchants/:merchantId/anonymize
 * Admin: execute PII anonymization (irreversible).
 */
export async function adminExecuteDeletion(req: AuthRequest, res: Response) {
  try {
    const { merchantId } = req.params as Record<string, string>;
    const adminId = req.user?.id ?? "admin";
    await executeDeletion(merchantId, adminId);
    res.json({ message: "Merchant account anonymized. Financial records retained." });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}
