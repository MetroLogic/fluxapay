/**
 * Tests that uploadKycDocumentService enforces a file size limit directly at
 * the service layer, independent of Multer's `limits.fileSize`. This guards
 * against the case where the route is called programmatically or Multer is
 * bypassed entirely (e.g. calling the service from a worker/script).
 */

jest.mock("../../config/prisma", () => ({
  prisma: {
    merchantKYC: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("../cloudinary.service", () => ({
  uploadToCloudinary: jest.fn(),
  deleteFromCloudinary: jest.fn(),
}));

jest.mock("../audit.service", () => ({
  logKycDecision: jest.fn(),
}));

jest.mock("../../utils/fileScan.util", () => ({
  scanFile: jest.fn(),
  handleScanFailure: jest.fn(),
}));

import { uploadKycDocumentService } from "../kyc.service";
import { prisma } from "../../config/prisma";
import { scanFile } from "../../utils/fileScan.util";
import { KYC_MAX_FILE_SIZE_BYTES } from "../../utils/kycUploadValidation.util";
import { ErrorCode } from "../../types/errors";

describe("uploadKycDocumentService - service-layer file size enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects an oversized file before any DB/scan/upload work, bypassing Multer entirely", async () => {
    const oversizedFile = {
      buffer: Buffer.alloc(1024),
      originalname: "large.jpg",
      mimetype: "image/jpeg",
      size: KYC_MAX_FILE_SIZE_BYTES + 1,
    };

    await expect(
      uploadKycDocumentService("merchant_1", "national_id" as any, oversizedFile),
    ).rejects.toMatchObject({
      status: 413,
      code: ErrorCode.FILE_TOO_LARGE,
    });

    // Confirms the rejection happens at the service layer itself, before
    // any downstream scan/DB/upload calls — i.e. Multer's own limit is not
    // what's stopping this file.
    expect(scanFile).not.toHaveBeenCalled();
    expect((prisma.merchantKYC.findUnique as jest.Mock)).not.toHaveBeenCalled();
  });
});
