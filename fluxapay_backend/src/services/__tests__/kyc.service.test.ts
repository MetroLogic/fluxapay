import {
  validateKycUploadFile,
  KYC_MAX_FILE_SIZE_BYTES,
} from "../../utils/kycUploadValidation.util";
import { ErrorCode } from "../../types/errors";

describe("KYC upload validation", () => {
  it("accepts JPEG files", () => {
    expect(
      validateKycUploadFile({ mimetype: "image/jpeg", size: 1024 }),
    ).toBeNull();
  });

  it("accepts PNG files", () => {
    expect(
      validateKycUploadFile({ mimetype: "image/png", size: 1024 }),
    ).toBeNull();
  });

  it("accepts PDF files", () => {
    expect(
      validateKycUploadFile({ mimetype: "application/pdf", size: 1024 }),
    ).toBeNull();
  });

  it("rejects invalid MIME types with INVALID_FILE_TYPE", () => {
    const result = validateKycUploadFile({
      mimetype: "image/gif",
      size: 1024,
    });
    expect(result).toEqual({
      status: 422,
      code: ErrorCode.INVALID_FILE_TYPE,
      message: "Invalid file type. Only JPEG, PNG, and PDF are allowed.",
    });
  });

  it("rejects executable MIME types with INVALID_FILE_TYPE", () => {
    const result = validateKycUploadFile({
      mimetype: "application/x-msdownload",
      size: 1024,
    });
    expect(result?.code).toBe(ErrorCode.INVALID_FILE_TYPE);
    expect(result?.status).toBe(422);
  });

  it("rejects files over 10MB with FILE_TOO_LARGE", () => {
    const result = validateKycUploadFile({
      mimetype: "image/jpeg",
      size: KYC_MAX_FILE_SIZE_BYTES + 1,
    });
    expect(result).toEqual({
      status: 422,
      code: ErrorCode.FILE_TOO_LARGE,
      message: "File size exceeds 10MB limit.",
    });
  });

  it("accepts files exactly at 10MB limit", () => {
    expect(
      validateKycUploadFile({
        mimetype: "application/pdf",
        size: KYC_MAX_FILE_SIZE_BYTES,
      }),
    ).toBeNull();
  });

  it("validates by MIME type, not extension", () => {
    const disguisedExe = validateKycUploadFile({
      mimetype: "application/x-msdownload",
      size: 500,
    });
    expect(disguisedExe?.code).toBe(ErrorCode.INVALID_FILE_TYPE);
  });
});
