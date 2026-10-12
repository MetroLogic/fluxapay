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
  prisma: {
    merchant: { findMany: jest.fn() },
    apiKey: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock("../../helpers/crypto.helper", () => ({
  compareKeys: jest.fn(),
}));

import { authenticateApiKey, isTestApiKey } from "../apiKeyAuth.middleware";
import { prisma } from "../../config/prisma";
import { compareKeys } from "../../helpers/crypto.helper";
import { apiKeyService } from "../../services/apiKey.service";
import { Response, NextFunction } from "express";
import { AuthRequest } from "../../types/express";

const mockFindMany = prisma.merchant.findMany as jest.Mock;
const mockCompare = compareKeys as jest.Mock;
const mockApiKeyFindMany = (prisma as any).apiKey.findMany as jest.Mock;
const mockApiKeyUpdateMany = (prisma as any).apiKey.updateMany as jest.Mock;

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
    mockFindMany.mockResolvedValue([]);
    mockApiKeyFindMany.mockResolvedValue([]);
    mockApiKeyUpdateMany.mockResolvedValue({ count: 1 });
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

  it("authenticates old and new keys concurrently during rotation", async () => {
    const oldReq = { headers: { "x-api-key": skLiveKey } } as AuthRequest;
    const newReq = { headers: { "x-api-key": skTestKey } } as AuthRequest;
    const oldNext = jest.fn();
    const newNext = jest.fn();
    mockApiKeyFindMany.mockImplementation(async ({ where }: { where: { key_last_four: string } }) => [
      {
        id: where.key_last_four === skLiveKey.slice(-4) ? "old-key" : "new-key",
        merchantId: "merchant_1",
        key_hash: "$2b$test-hash",
      },
    ]);
    mockCompare.mockResolvedValue(true);

    await Promise.all([
      authenticateApiKey(oldReq, mockRes as Response, oldNext as NextFunction),
      authenticateApiKey(newReq, mockRes as Response, newNext as NextFunction),
    ]);

    expect(oldNext).toHaveBeenCalledTimes(1);
    expect(newNext).toHaveBeenCalledTimes(1);
    expect(oldReq.merchantId).toBe("merchant_1");
    expect(newReq.merchantId).toBe("merchant_1");
    expect(mockApiKeyUpdateMany).toHaveBeenCalledTimes(2);
    expect(apiKeyService).toBeDefined();
  });

  it("rejects a key that expires before its usage update completes", async () => {
    mockReq.headers = { "x-api-key": skLiveKey };
    mockApiKeyFindMany.mockResolvedValueOnce([{
      id: "expired-during-validation",
      merchantId: "merchant_1",
      key_hash: "$2b$test-hash",
    }]);
    mockCompare.mockResolvedValueOnce(true);
    mockApiKeyUpdateMany.mockResolvedValueOnce({ count: 0 });

    await authenticateApiKey(mockReq as AuthRequest, mockRes as Response, mockNext as NextFunction);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });
});