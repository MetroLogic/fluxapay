/**
 * rateLimit.consolidation.test.ts
 *
 * Tests for consolidated rate limiting middleware.
 * Verifies all rate-limited responses include standard headers:
 *  - X-RateLimit-Limit
 *  - X-RateLimit-Remaining
 *  - Retry-After (on 429)
 */

jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(30),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({
    rateLimitLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  })),
}));

import type { Request, Response, NextFunction } from "express";
import { simpleRateLimit } from "../simpleRateLimit.middleware";
import {
  authRateLimit,
  merchantApiKeyRateLimit,
  setRedisClientForTests,
  resetRedisClientForTests,
} from "../rateLimit.middleware";
import { AuthRequest } from "../../types/express";
import Redis from "ioredis";

function createMemoryRedisMock() {
  const counts = new Map<string, number>();
  return {
    incr: jest.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(30),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
  };
}

describe("Consolidated Rate Limiting - Header Standards", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;
  let setHeaderSpy: jest.Mock;
  let statusSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRedisClientForTests();
    setRedisClientForTests(createMemoryRedisMock() as unknown as Redis);
    setHeaderSpy = jest.fn();
    statusSpy = jest.fn().mockReturnThis();

    mockReq = {
      ip: "192.168.1.100",
      socket: { remoteAddress: "192.168.1.100" } as any,
      path: "/api/test",
    };

    mockRes = {
      setHeader: setHeaderSpy,
      status: statusSpy,
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    resetRedisClientForTests();
  });

  describe("simpleRateLimit - Header Standards", () => {
    it("should set X-RateLimit-Limit header on successful request", () => {
      const middleware = simpleRateLimit({
        max: 10,
        windowMs: 60000,
        keyPrefix: "test",
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Limit", "10");
      expect(mockNext).toHaveBeenCalled();
    });

    it("should set X-RateLimit-Remaining header on successful request", () => {
      const middleware = simpleRateLimit({
        max: 10,
        windowMs: 60000,
        keyPrefix: "test_remaining_solo",
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", "9");
    });

    it("should set all standard headers on rate limit exceeded (429)", () => {
      const middleware = simpleRateLimit({
        max: 1,
        windowMs: 60000,
        keyPrefix: "test429",
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Limit", "1");
      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", "0");
      expect(setHeaderSpy).toHaveBeenCalledWith("Retry-After", expect.any(String));
      expect(statusSpy).toHaveBeenCalledWith(429);
    });

    it("should calculate remaining requests correctly", () => {
      const middleware = simpleRateLimit({
        max: 5,
        windowMs: 60000,
        keyPrefix: "test_calc",
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", "4");

      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", "3");
    });
  });

  describe("authRateLimit - Header Standards", () => {
    it("should set standard headers on successful request", async () => {
      const middleware = authRateLimit();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Limit", expect.any(String));
      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      expect(mockNext).toHaveBeenCalled();
    });

    it("should set Retry-After when rate limited", async () => {
      const middleware = authRateLimit();

      for (let i = 0; i < 15; i++) {
        await middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(setHeaderSpy).toHaveBeenCalledWith("Retry-After", expect.any(String));
      expect(statusSpy).toHaveBeenCalledWith(429);
    });
  });

  describe("merchantApiKeyRateLimit - Header Standards", () => {
    it("should set standard headers on successful request", async () => {
      const middleware = merchantApiKeyRateLimit();
      const authReq = { ...mockReq, merchantId: "merchant_123" } as AuthRequest;

      await middleware(authReq, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Limit", expect.any(String));
      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      expect(mockNext).toHaveBeenCalled();
    });

    it("should set Retry-After when rate limited", async () => {
      const middleware = merchantApiKeyRateLimit();
      const authReq = { ...mockReq, merchantId: "merchant_limit" } as AuthRequest;

      for (let i = 0; i < 205; i++) {
        await middleware(authReq, mockRes as Response, mockNext);
      }

      expect(setHeaderSpy).toHaveBeenCalledWith("Retry-After", expect.any(String));
      expect(statusSpy).toHaveBeenCalledWith(429);
    });
  });

  describe("Header consistency across middlewares", () => {
    it("all middlewares use X-RateLimit-Limit header", async () => {
      const simple = simpleRateLimit({ max: 10, windowMs: 60000 });
      const auth = authRateLimit();
      const merchant = merchantApiKeyRateLimit();

      const authReq = { ...mockReq, merchantId: "merchant_123" } as AuthRequest;

      simple(mockReq as Request, mockRes as Response, mockNext);
      await auth(mockReq as Request, mockRes as Response, mockNext);
      await merchant(authReq, mockRes as Response, mockNext);

      const limitCalls = setHeaderSpy.mock.calls.filter((c) => c[0] === "X-RateLimit-Limit");
      expect(limitCalls.length).toBeGreaterThanOrEqual(3);
    });

    it("all middlewares use X-RateLimit-Remaining header", async () => {
      const simple = simpleRateLimit({ max: 10, windowMs: 60000, keyPrefix: "test_remaining_1" });
      const auth = authRateLimit();
      const merchant = merchantApiKeyRateLimit();

      const authReq = { ...mockReq, merchantId: "merchant_456" } as AuthRequest;

      simple(mockReq as Request, mockRes as Response, mockNext);
      await auth(mockReq as Request, mockRes as Response, mockNext);
      await merchant(authReq, mockRes as Response, mockNext);

      const remainingCalls = setHeaderSpy.mock.calls.filter((c) => c[0] === "X-RateLimit-Remaining");
      expect(remainingCalls.length).toBeGreaterThanOrEqual(3);
    });

    it("all middlewares use Retry-After on 429", async () => {
      const simple = simpleRateLimit({ max: 1, windowMs: 60000, keyPrefix: "test_retry" });
      const auth = authRateLimit();
      const merchant = merchantApiKeyRateLimit();

      const authReq = { ...mockReq, merchantId: "merchant_789" } as AuthRequest;

      simple(mockReq as Request, mockRes as Response, mockNext);
      simple(mockReq as Request, mockRes as Response, mockNext);

      for (let i = 0; i < 15; i++) {
        await auth(mockReq as Request, mockRes as Response, mockNext);
      }

      for (let i = 0; i < 205; i++) {
        await merchant(authReq, mockRes as Response, mockNext);
      }

      const retryCalls = setHeaderSpy.mock.calls.filter((c) => c[0] === "Retry-After");
      expect(retryCalls.length).toBeGreaterThanOrEqual(3);
    });
  });
});
