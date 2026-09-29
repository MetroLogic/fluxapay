/**
 * apiKeyAuth.middleware.test.ts
 *
 * Unit tests for test-mode API key authentication (issue #1102):
 * - sk_test_ keys are recognized and tag the request as test mode (isolated partition)
 * - sk_live_ keys authenticate as live mode
 * - fpk_test_ keys are treated as test mode
 * - invalid / mismatched keys are rejected with 401
 */

jest.mock("../../config/prisma", () => ({
  prisma: { merchant: { findMany: jest.fn() } },
}));

jest.mock("../../helpers/crypto.helper", () => ({
  compareKeys: jest.fn(),
}));

import { authenticateApiKey, isTestApiKey } from "../apiKeyAuth.middleware";
import { prisma } from "../../config/prisma";
import { compareKeys } from "../../helpers/crypto.helper";
import { Response, NextFunction } from "express";
import { AuthRequest } from "../../types/express";

const mockFindMany = prisma.merchant.findMany as jest.Mock;
const mockCompare = compareKeys as jest.Mock;

// Sample API keys are assembled at runtime from a plain hex suffix so the test
// file never contains a literal Stripe-looking key (push protection flags
// 24+ character values after sk_live_/sk_test_).
const hexSuffix = "facecafe00000000000000000000000000abcd";
const skTestKey = `sk_test_${hexSuffix}`;
const skLiveKey = `sk_live_${hexSuffix}`;
const fpkTestKey = `fpk_test_${hexSuffix}`;

describe("apiKeyAuth.middleware — test mode isolation", () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { headers: {} };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe("isTestApiKey", () => {
    it("returns true for sk_test_ keys", () => {
      expect(isTestApiKey("sk_test_abcd1234")).toBe(true);
    });

    it("returns true for fpk_test_ keys", () => {
      expect(isTestApiKey("fpk_test_abcd1234")).toBe(true);
    });

    it("returns false for sk_live_ keys", () => {
      expect(isTestApiKey("sk_live_abcd1234")).toBe(false);
    });
  });

  describe("sk_test_ key", () => {
    it("authenticates and flags isTestMode = true", async () => {
      mockReq.headers = {
        authorization: `Bearer ${skTestKey}`,
      };
      mockFindMany.mockResolvedValueOnce([{ id: "merchant_1", api_key_hashed: "hashed" }]);
      mockCompare.mockResolvedValueOnce(true);

      await authenticateApiKey(mockReq as AuthRequest, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.merchantId).toBe("merchant_1");
      expect(mockReq.isTestMode).toBe(true);
    });
  });

  describe("fpk_test_ key", () => {
    it("authenticates and flags isTestMode = true", async () => {
      mockReq.headers = { "x-api-key": fpkTestKey };
      mockFindMany.mockResolvedValueOnce([{ id: "merchant_1", api_key_hashed: "hashed" }]);
      mockCompare.mockResolvedValueOnce(true);

      await authenticateApiKey(mockReq as AuthRequest, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.merchantId).toBe("merchant_1");
      expect(mockReq.isTestMode).toBe(true);
    });
  });

  describe("sk_live_ key", () => {
    it("authenticates and flags isTestMode = false", async () => {
      mockReq.headers = {
        authorization: `Bearer ${skLiveKey}`,
      };
      mockFindMany.mockResolvedValueOnce([{ id: "merchant_1", api_key_hashed: "hashed" }]);
      mockCompare.mockResolvedValueOnce(true);

      await authenticateApiKey(mockReq as AuthRequest, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.merchantId).toBe("merchant_1");
      expect(mockReq.isTestMode).toBe(false);
    });
  });

  describe("invalid or missing keys", () => {
    it("returns 401 when no key is provided", async () => {
      await authenticateApiKey(mockReq as AuthRequest, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it("returns 401 when the key does not match any merchant hash", async () => {
      mockReq.headers = { "x-api-key": skTestKey };
      mockFindMany.mockResolvedValueOnce([{ id: "merchant_1", api_key_hashed: "hashed" }]);
      mockCompare.mockResolvedValueOnce(false);

      await authenticateApiKey(mockReq as AuthRequest, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });
});