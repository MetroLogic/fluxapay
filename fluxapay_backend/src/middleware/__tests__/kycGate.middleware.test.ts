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
        kyc: { kyc_status: "approved" },
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
        kyc: { kyc_status: "pending_review" },
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalled();
    });

    it("should block when KYC status is rejected", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc: { kyc_status: "rejected" },
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalled();
    });

    it("should block when KYC is not submitted", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc: null,
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe("error response format", () => {
    it("should include actual KYC status in error response", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc: { kyc_status: "rejected" },
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            kyc_status: "rejected",
          }),
        }),
      );
    });
  });

  describe("all KYC statuses", () => {
    it("should allow status: approved", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "merchant_test_123",
        kyc: { kyc_status: "approved" },
      });

      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it.each(["pending_review", "rejected", "not_submitted"] as const)(
      "should block status: %s",
      async (status) => {
        (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce({
          id: "merchant_test_123",
          kyc: status === "not_submitted" ? null : { kyc_status: status },
        });

        await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);
        expect(mockNext).not.toHaveBeenCalled();
        expect(mockRes.status).toHaveBeenCalledWith(403);
      },
    );
  });

  describe("missing merchant", () => {
    it("should return 401 when merchantId missing", async () => {
      mockReq.merchantId = undefined;
      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it("should return 401 when merchant not found", async () => {
      (mockPrisma.merchant.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await kycGateMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });
});
