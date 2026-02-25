import { Request, Response } from "express";
import { WebhookEventType, WebhookStatus, PrismaClient, KYCStatus, DocumentType } from "../generated/client";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import {
  submitKycService,
  uploadKycDocumentService,
  getKycStatusService,
  updateKycStatusService,
  getAllKycSubmissionsService,
  getKycDetailsByMerchantIdService,
} from "../services/kyc.service";

/**
 * Submit KYC information
 */
export async function submitKyc(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await submitKycService(merchantId, req.body);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * Upload KYC document
 */
export async function uploadKycDocument(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { document_type } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await uploadKycDocumentService(
      merchantId,
      document_type, // Assuming DocumentType is now imported via `WebhookEventType, WebhookStatus, PrismaClient` or inferred
      {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      }
    );
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * Get KYC status for logged-in merchant
 */
export async function getKycStatus(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await getKycStatusService(merchantId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * Update KYC status (Admin only)
 */
export async function updateKycStatus(req: AuthRequest, res: Response) {
  try {
    const reviewerId = await validateUserId(req);
    const { merchantId } = req.params;
    if (!merchantId || typeof merchantId !== "string") {
      return res.status(400).json({ message: "Invalid merchant ID" });
    }
    const result = await updateKycStatusService(merchantId, req.body, reviewerId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * Get all KYC submissions (Admin only)
 */
export async function getAllKycSubmissions(req: AuthRequest, res: Response) {
  try {
    const { status, page = "1", limit = "10" } = req.query;
    const result = await getAllKycSubmissionsService(
      status as KYCStatus | undefined,
      parseInt(page as string),
      parseInt(limit as string)
    );
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status((err as any).status || 500).json({ message: (err as any).message || "Server error" });
  }
}

/**
 * Get KYC details by merchant ID (Admin only)
 */
export async function getKycDetailsByMerchantId(req: AuthRequest, res: Response) {
  try {
    const { merchantId } = req.params;
    if (!merchantId || typeof merchantId !== "string") {
      return res.status(400).json({ message: "Invalid merchant ID" });
    }
    const result = await getKycDetailsByMerchantIdService(merchantId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}
