/**
 * kycGate.middleware.test.ts
 *
 * Unit tests for KYC gate middleware.
 * Tests KYC status enforcement (approved, pending, rejected, not_submitted).
 */

jest.mock("../../generated/client/client", () => {
  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { kycGateMiddleware } from "../kycGate.middleware";
import { PrismaClient } from "../../generated/client/client";
import { Response, NextFunction } from "express";
import { AuthRequest } from "../../types/express";

const mockPrisma = new PrismaClient();

describe("kycGate.middleware", () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      merchantId: "merchant_test_123",
    };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe("approved KYC status", () => {
    it("should pass through when KYC status is approved", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc_status: "approved",
        is_internal: false,
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe("unapproved KYC statuses", () => {
    it("should block when KYC status is pending_review", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc_status: "pending_review",
        is_internal: false,
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalled();
    });

    it("should block when KYC status is rejected", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc_status: "rejected",
        is_internal: false,
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it("should block when KYC status is not_submitted", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc_status: "not_submitted",
        is_internal: false,
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe("admin bypass", () => {
    it("should allow internal merchants to bypass KYC check", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc_status: "not_submitted",
        is_internal: true,
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it("should allow test merchants with pending status", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "test_merchant_123",
        kyc_status: "pending_review",
        is_internal: true,
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("error response format", () => {
    it("should include KYC submission URL in error response", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc_status: "pending_review",
        is_internal: false,
      });

      const jsonMock = jest.fn().mockReturnThis();
      mockRes.status = jest.fn().mockReturnValue({ json: jsonMock });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      const callArg = jsonMock.mock.calls[0][0];
      expect(callArg).toHaveProperty("details");
      expect(callArg.details).toHaveProperty("kyc_submission_url");
      expect(callArg.details.kyc_submission_url).toContain("/api/v1/merchants/kyc");
    });

    it("should include actual KYC status in error response", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc_status: "rejected",
        is_internal: false,
      });

      const jsonMock = jest.fn().mockReturnThis();
      mockRes.status = jest.fn().mockReturnValue({ json: jsonMock });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      const callArg = jsonMock.mock.calls[0][0];
      expect(callArg.details).toHaveProperty("kyc_status", "rejected");
    });

    it("should use KYC_REQUIRED error code", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc_status: "not_submitted",
        is_internal: false,
      });

      const jsonMock = jest.fn().mockReturnThis();
      mockRes.status = jest.fn().mockReturnValue({ json: jsonMock });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      const callArg = jsonMock.mock.calls[0][0];
      expect(callArg.code).toBe("KYC_REQUIRED");
    });
  });

  describe("unauthorized cases", () => {
    it("should return 401 when merchantId is missing", async () => {
      mockReq.merchantId = undefined;

      const jsonMock = jest.fn().mockReturnThis();
      mockRes.status = jest.fn().mockReturnValue({ json: jsonMock });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it("should return 401 when merchant not found in database", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const jsonMock = jest.fn().mockReturnThis();
      mockRes.status = jest.fn().mockReturnValue({ json: jsonMock });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe("error handling", () => {
    it("should return 500 on database error", async () => {
      const dbError = new Error("Database connection failed");
      (mockPrisma.merchant.findUnique as jest.Mock).mockRejectedValueOnce(dbError);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const jsonMock = jest.fn().mockReturnThis();
      mockRes.status = jest.fn().mockReturnValue({ json: jsonMock });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error checking KYC status")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("all KYC statuses", () => {
    const testCases = [
      { status: "approved", shouldPass: true },
      { status: "pending_review", shouldPass: false },
      { status: "rejected", shouldPass: false },
      { status: "not_submitted", shouldPass: false },
    ];

    testCases.forEach(({ status, shouldPass }) => {
      it(`should ${shouldPass ? "allow" : "block"} status: ${status}`, async () => {
        (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
          id: "merchant_test_123",
          kyc_status: status,
          is_internal: false,
        });

        await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        if (shouldPass) {
          expect(mockNext).toHaveBeenCalled();
        } else {
          expect(mockNext).not.toHaveBeenCalled();
          expect(mockRes.status).toHaveBeenCalledWith(403);
        }
      });
    });
  });
});
