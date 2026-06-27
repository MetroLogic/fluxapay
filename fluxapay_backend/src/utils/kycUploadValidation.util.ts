import { apiError, ApiErrorPayload } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

export const KYC_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const KYC_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function validateKycUploadFile(file: {
  mimetype: string;
  size: number;
}): ApiErrorPayload | null {
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

  return null;
}
