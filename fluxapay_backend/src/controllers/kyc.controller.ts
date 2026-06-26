import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Response } from "express";
import { KYCStatus } from "../generated/client/client";
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
    const result = await submitKycService(merchantId, (req as unknown as any).body);
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error(err);
    const error = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

/**
 * Upload KYC document
 */
export async function uploadKycDocument(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { document_type } = (req as unknown as any).body;

    if (!(req as unknown as any).file) {
      return sendApiError(res, apiError(400, ErrorCode.NO_FILE_UPLOADED, "No file uploaded"));
    }

    const result = await uploadKycDocumentService(
      merchantId,
      document_type as any,
      {
        buffer: (req as unknown as any).file.buffer,
        originalname: (req as unknown as any).file.originalname,
        mimetype: (req as unknown as any).file.mimetype,
        size: (req as unknown as any).file.size,
      }
    );
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error(err);
    const error = err as { status?: number; message?: string };
    sendApiError(res, err);
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
  } catch (err: unknown) {
    console.error(err);
    const error = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

/**
 * Update KYC status (Admin only)
 */
export async function updateKycStatus(req: AuthRequest, res: Response) {
  try {
    const reviewerId = await validateUserId(req);
    const { merchantId } = (req as unknown as any).params;
    if (!merchantId || typeof merchantId !== "string") {
      return sendApiError(res, apiError(400, ErrorCode.INVALID_MERCHANT_ID, "Invalid merchant ID"));
    }
    const result = await updateKycStatusService(merchantId, (req as unknown as any).body, reviewerId);
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error(err);
    const error = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

/**
 * Get all KYC submissions (Admin only)
 */
export async function getAllKycSubmissions(req: AuthRequest, res: Response) {
  try {
    const { status, page = "1", limit = "10" } = (req as unknown as any).query;
    const result = await getAllKycSubmissionsService(
      status as KYCStatus | undefined,
      parseInt(page as string),
      parseInt(limit as string)
    );
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error(err);
    const error = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

/**
 * Get KYC details by merchant ID (Admin only)
 */
export async function getKycDetailsByMerchantId(req: AuthRequest, res: Response) {
  try {
    const { merchantId } = (req as unknown as any).params;
    if (!merchantId || typeof merchantId !== "string") {
      return sendApiError(res, apiError(400, ErrorCode.INVALID_MERCHANT_ID, "Invalid merchant ID"));
    }
    const result = await getKycDetailsByMerchantIdService(merchantId);
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error(err);
    const error = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}
