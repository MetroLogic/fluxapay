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
  getKycExpiryWarningsService,
} from "../services/kyc.service";

const MAX_KYC_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_KYC_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

/**
 * Inspect a file buffer's magic bytes to determine its true MIME type.
 * Returns null when the buffer does not match a supported signature.
 */
function detectMimeTypeFromMagicBytes(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  // PDF: %PDF-
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return "application/pdf";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  return null;
}

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
    const { document_type, document_expiry_date } = (req as unknown as any).body;

    if (!(req as unknown as any).file) {
      return sendApiError(res, apiError(400, ErrorCode.NO_FILE_UPLOADED, "No file uploaded"));
    }

    const file = (req as unknown as any).file as {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    };

    if (typeof file.size === "number" && file.size > MAX_KYC_DOCUMENT_SIZE_BYTES) {
      return sendApiError(
        res,
        apiError(400, ErrorCode.INVALID_FILE_TYPE, "File exceeds the 10MB size limit")
      );
    }

    const detectedMimeType = detectMimeTypeFromMagicBytes(file.buffer);
    if (!detectedMimeType || !ALLOWED_KYC_MIME_TYPES.has(detectedMimeType)) {
      return sendApiError(
        res,
        apiError(400, ErrorCode.INVALID_FILE_TYPE, "Unsupported or corrupted file type")
      );
    }

    const result = await uploadKycDocumentService(
      merchantId,
      document_type as any,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: detectedMimeType,
        size: file.size,
      }
    );
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error(err);
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
 * Get KYC document expiry warnings for logged-in merchant
 */
export async function getKycExpiryWarnings(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await getKycExpiryWarningsService(merchantId);
    res.status(200).json(result);
  } catch (err: unknown) {
    console.error(err);
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
      parseInt(limit as string),
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
