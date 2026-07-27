import {
  validateKycUploadFile,
  KYC_MAX_FILE_SIZE_BYTES,
} from "../../utils/kycUploadValidation.util";
import { ErrorCode } from "../../types/errors";

// Minimal real magic-byte fixtures so `file-type` detects the genuine
// content type, independent of the declared `mimetype` string.
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF_BYTES = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "binary");
// Windows PE executable ("MZ") header, disguised with an image/jpeg mimetype.
const EXE_BYTES = Buffer.from([
  0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
]);
const EMPTY_BYTES = Buffer.alloc(0);

describe("KYC upload validation", () => {
  it("accepts JPEG files", async () => {
    expect(
      await validateKycUploadFile({
        mimetype: "image/jpeg",
        size: 1024,
        buffer: JPEG_BYTES,
      }),
    ).toBeNull();
  });

  it("accepts PNG files", async () => {
    expect(
      await validateKycUploadFile({
        mimetype: "image/png",
        size: 1024,
        buffer: PNG_BYTES,
      }),
    ).toBeNull();
  });

  it("accepts PDF files", async () => {
    expect(
      await validateKycUploadFile({
        mimetype: "application/pdf",
        size: 1024,
        buffer: PDF_BYTES,
      }),
    ).toBeNull();
  });

  it("rejects invalid MIME types with INVALID_FILE_TYPE", async () => {
    const result = await validateKycUploadFile({
      mimetype: "image/gif",
      size: 1024,
      buffer: EMPTY_BYTES,
    });
    expect(result).toEqual({
      status: 422,
      code: ErrorCode.INVALID_FILE_TYPE,
      message: "Invalid file type. Only JPEG, PNG, and PDF are allowed.",
    });
  });

  it("rejects executable MIME types with INVALID_FILE_TYPE", async () => {
    const result = await validateKycUploadFile({
      mimetype: "application/x-msdownload",
      size: 1024,
      buffer: EXE_BYTES,
    });
    expect(result?.code).toBe(ErrorCode.INVALID_FILE_TYPE);
    expect(result?.status).toBe(422);
  });

  it("rejects files over 10MB with FILE_TOO_LARGE", async () => {
    const result = await validateKycUploadFile({
      mimetype: "image/jpeg",
      size: KYC_MAX_FILE_SIZE_BYTES + 1,
      buffer: JPEG_BYTES,
    });
    expect(result).toEqual({
      status: 422,
      code: ErrorCode.FILE_TOO_LARGE,
      message: "File size exceeds 10MB limit.",
    });
  });

  it("accepts files exactly at 10MB limit", async () => {
    expect(
      await validateKycUploadFile({
        mimetype: "application/pdf",
        size: KYC_MAX_FILE_SIZE_BYTES,
        buffer: PDF_BYTES,
      }),
    ).toBeNull();
  });

  it("validates by MIME type, not extension", async () => {
    const disguisedExe = await validateKycUploadFile({
      mimetype: "application/x-msdownload",
      size: 500,
      buffer: EXE_BYTES,
    });
    expect(disguisedExe?.code).toBe(ErrorCode.INVALID_FILE_TYPE);
  });

  it("rejects a renamed .exe declaring Content-Type: image/jpeg with a 400 magic-byte mismatch", async () => {
    const result = await validateKycUploadFile({
      mimetype: "image/jpeg",
      size: 1024,
      buffer: EXE_BYTES,
    });
    expect(result).toEqual({
      status: 400,
      code: ErrorCode.INVALID_FILE_TYPE,
      message: "File content does not match its declared type.",
    });
  });

  it("rejects a PNG disguised as a PDF (magic bytes don't match declared type)", async () => {
    const result = await validateKycUploadFile({
      mimetype: "application/pdf",
      size: 1024,
      buffer: PNG_BYTES,
    });
    expect(result?.status).toBe(400);
    expect(result?.code).toBe(ErrorCode.INVALID_FILE_TYPE);
  });
});
