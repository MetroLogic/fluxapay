import { fromBuffer } from "file-type";
import { apiError, ApiErrorPayload } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

export const KYC_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const KYC_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Validates a KYC upload. In addition to the declared `mimetype`/`size`,
 * this reads the file's actual magic bytes and rejects it if they don't
 * match the declared type -- a spoofed `Content-Type`/`mimetype` header
 * alone is not enough to pass validation.
 */
export async function validateKycUploadFile(file: {
  mimetype: string;
  size: number;
  buffer: Buffer;
}): Promise<ApiErrorPayload | null> {
  if (!KYC_ALLOWED_MIME_TYPES.includes(file.mimetype as (typeof KYC_ALLOWED_MIME_TYPES)[number])) {
    return apiError(
      422,
      ErrorCode.INVALID_FILE_TYPE,
      "Invalid file type. Only JPEG, PNG, and PDF are allowed.",
    );
  }

  if (file.size > KYC_MAX_FILE_SIZE_BYTES) {
    return apiError(422, ErrorCode.FILE_TOO_LARGE, "File size exceeds 10MB limit.");
  }

  const detected = await fromBuffer(file.buffer);
  if (!detected || !(KYC_ALLOWED_MIME_TYPES as readonly string[]).includes(detected.mime) || detected.mime !== file.mimetype) {
    return apiError(
      400,
      ErrorCode.INVALID_FILE_TYPE,
      "File content does not match its declared type.",
    );
  }

  return null;
}
