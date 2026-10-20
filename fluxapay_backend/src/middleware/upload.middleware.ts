import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

/**
 * Maximum allowed KYC document upload size (10MB).
 */
export const MAX_KYC_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * MIME types accepted for merchant KYC documents.
 */
export const ALLOWED_KYC_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type AllowedKycMimeType = (typeof ALLOWED_KYC_MIME_TYPES)[number];

/**
 * Scan status for a KYC document. Newly uploaded documents start as
 * PENDING_SCAN until the virus scan check completes.
 */
export type KycDocumentScanStatus =
  | "PENDING_SCAN"
  | "CLEAN"
  | "INFECTED"
  | "FAILED";

/**
 * In-memory multer storage. Files are held in the buffer so magic bytes can be
 * inspected before anything is persisted.
 */
const memoryStorage = multer.memoryStorage();

/**
 * Multer instance enforcing the 10MB size limit for KYC uploads.
 */
export const kycUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: MAX_KYC_UPLOAD_BYTES },
});

function rejectInvalidFileType(res: Response, message: string): void {
  res.status(400).json({
    error: {
      code: "INVALID_FILE_TYPE",
      message,
    },
  });
}

/**
 * Inspect the magic bytes of an uploaded buffer to determine its true MIME
 * type, ignoring the client-supplied extension or content-type header.
 */
export async function detectKycMimeType(
  buffer: Buffer,
): Promise<AllowedKycMimeType | null> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) {
    return null;
  }
  if (
    (ALLOWED_KYC_MIME_TYPES as readonly string[]).includes(detected.mime)
  ) {
    return detected.mime as AllowedKycMimeType;
  }
  return null;
}

/**
 * Express middleware that validates multipart file uploads for KYC documents
 * using magic byte inspection. Rejects disallowed or corrupted files with
 * 400 Bad Request and error code INVALID_FILE_TYPE.
 */
export async function validateKycUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const files: Express.Multer.File[] = [];

  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    for (const group of Object.values(req.files)) {
      if (Array.isArray(group)) {
        files.push(...group);
      }
    }
  }

  if (req.file) {
    files.push(req.file);
  }

  if (files.length === 0) {
    next();
    return;
  }

  for (const file of files) {
    if (file.size > MAX_KYC_UPLOAD_BYTES) {
      rejectInvalidFileType(
        res,
        `File exceeds the maximum allowed size of ${MAX_KYC_UPLOAD_BYTES} bytes`,
      );
      return;
    }

    if (!file.buffer || file.buffer.length === 0) {
      rejectInvalidFileType(res, "Uploaded file is empty or corrupted");
      return;
    }

    let detected: AllowedKycMimeType | null;
    try {
      detected = await detectKycMimeType(file.buffer);
    } catch {
      rejectInvalidFileType(res, "Uploaded file is corrupted");
      return;
    }

    if (!detected) {
      rejectInvalidFileType(
        res,
        "Unsupported file type. Allowed types: PDF, PNG, JPEG",
      );
      return;
    }

    // Trust the detected magic-byte MIME type over the client-supplied one.
    file.mimetype = detected;
    (file as Express.Multer.File & { scanStatus?: KycDocumentScanStatus })
      .scanStatus = "PENDING_SCAN";
  }

  next();
}

/**
 * Combined middleware: parse multipart uploads (single field "document") and
 * validate them via magic byte inspection.
 */
export const kycDocumentUpload = [
  kycUpload.single("document"),
  validateKycUpload,
];
