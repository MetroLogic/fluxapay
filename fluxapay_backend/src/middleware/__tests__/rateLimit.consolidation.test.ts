/**
 * rateLimit.consolidation.test.ts
 *
 * Tests for consolidated rate limiting middleware.
 * Verifies all rate-limited responses include standard headers:
 *  - X-RateLimit-Limit
 *  - X-RateLimit-Remaining
 *  - Retry-After (on 429)
 */

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({
    rateLimitLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  })),
}));

import type { Request, Response, NextFunction } from "express";
import { simpleRateLimit } from "../simpleRateLimit.middleware";
import { authRateLimit, merchantApiKeyRateLimit } from "../rateLimit.middleware";
import { AuthRequest } from "../../types/express";

describe("Consolidated Rate Limiting - Header Standards", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;
  let setHeaderSpy: jest.Mock;
  let statusSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    setHeaderSpy = jest.fn();
    statusSpy = jest.fn().mockReturnThis();

    mockReq = {
      ip: "192.168.1.100",
      socket: { remoteAddress: "192.168.1.100" },
      path: "/api/test",
    };

    mockRes = {
      setHeader: setHeaderSpy,
      status: statusSpy,
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe("simpleRateLimit - Header Standards", () => {
    it("should set X-RateLimit-Limit header on successful request", (done) => {
      const middleware = simpleRateLimit({
        max: 10,
        windowMs: 60000,
        keyPrefix: "test",
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Limit", "10");
      expect(mockNext).toHaveBeenCalled();
      done();
    });

    it("should set X-RateLimit-Remaining header on successful request", (done) => {
      const middleware = simpleRateLimit({
        max: 10,
        windowMs: 60000,
        keyPrefix: "test",
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", "9");
      done();
    });

    it("should set all standard headers on rate limit exceeded (429)", (done) => {
      const middleware = simpleRateLimit({
        max: 1,
        windowMs: 60000,
        keyPrefix: "test429",
      });

      // First request succeeds
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Second request exceeds limit
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Verify headers are set
      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Limit", "1");
      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", "0");
      expect(setHeaderSpy).toHaveBeenCalledWith("Retry-After", expect.any(String));
      expect(statusSpy).toHaveBeenCalledWith(429);
      done();
    });

    it("should calculate remaining requests correctly", (done) => {
      const middleware = simpleRateLimit({
        max: 100,
        windowMs: 60000,
        keyPrefix: "test_remaining",
      });

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      // Last call should show 95 remaining
      expect(setHeaderSpy).toHaveBeenLastCalledWith("X-RateLimit-Remaining", expect.any(String));
      const lastCall = setHeaderSpy.mock.calls.filter((c) => c[0] === "X-RateLimit-Remaining").pop();
      expect(lastCall?.[1]).toBe("95");
      done();
    });
  });

  describe("authRateLimit - Header Standards", () => {
    it("should set X-RateLimit-Limit on successful auth request", (done) => {
      const middleware = authRateLimit();

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Limit", expect.any(String));
      expect(mockNext).toHaveBeenCalled();
      done();
    });

    it("should set X-RateLimit-Remaining on successful auth request", (done) => {
      const middleware = authRateLimit();

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      done();
    });

    it("should set Retry-After on auth rate limit exceeded", (done) => {
      const middleware = authRateLimit();

      // Simulate exceeding limit
      for (let i = 0; i < 15; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      // Should have Retry-After header
      const retryAfterCall = setHeaderSpy.mock.calls.find((c) => c[0] === "Retry-After");
      expect(retryAfterCall).toBeDefined();
      expect(statusSpy).toHaveBeenCalledWith(429);
      done();
    });
  });

  describe("merchantApiKeyRateLimit - Header Standards", () => {
    it("should set X-RateLimit-Limit on successful merchant API request", (done) => {
      const middleware = merchantApiKeyRateLimit();
      const authReq = {
        ...mockReq,
        merchantId: "merchant_123",
      } as AuthRequest;

      middleware(authReq, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Limit", expect.any(String));
      expect(mockNext).toHaveBeenCalled();
      done();
    });

    it("should set X-RateLimit-Remaining on successful merchant API request", (done) => {
      const middleware = merchantApiKeyRateLimit();
      const authReq = {
        ...mockReq,
        merchantId: "merchant_123",
      } as AuthRequest;

      middleware(authReq, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      done();
    });

    it("should include Retry-After on merchant rate limit exceeded", (done) => {
      const middleware = merchantApiKeyRateLimit();
      const authReq = {
        ...mockReq,
        merchantId: "merchant_123",
      } as AuthRequest;

      // Simulate exceeding limit (default 200)
      for (let i = 0; i < 205; i++) {
        middleware(authReq, mockRes as Response, mockNext);
      }

      // Last request should set Retry-After
      const retryCall = setHeaderSpy.mock.calls.find((c) => c[0] === "Retry-After");
      expect(retryCall).toBeDefined();
      expect(statusSpy).toHaveBeenCalledWith(429);
      done();
    });
  });

  describe("Header consistency across middlewares", () => {
    it("all middlewares use X-RateLimit-Limit header", () => {
      const simple = simpleRateLimit({ max: 10, windowMs: 60000 });
      const auth = authRateLimit();
      const merchant = merchantApiKeyRateLimit();

      const authReq = { ...mockReq, merchantId: "merchant_123" } as AuthRequest;

      simple(mockReq as Request, mockRes as Response, mockNext);
      auth(mockReq as Request, mockRes as Response, mockNext);
      merchant(authReq, mockRes as Response, mockNext);

      const limitCalls = setHeaderSpy.mock.calls.filter((c) => c[0] === "X-RateLimit-Limit");
      expect(limitCalls.length).toBeGreaterThanOrEqual(3);
    });

    it("all middlewares use X-RateLimit-Remaining header", () => {
      const simple = simpleRateLimit({ max: 10, windowMs: 60000, keyPrefix: "test_remaining_1" });
      const auth = authRateLimit();
      const merchant = merchantApiKeyRateLimit();

      const authReq = { ...mockReq, merchantId: "merchant_456" } as AuthRequest;

      simple(mockReq as Request, mockRes as Response, mockNext);
      auth(mockReq as Request, mockRes as Response, mockNext);
      merchant(authReq, mockRes as Response, mockNext);

      const remainingCalls = setHeaderSpy.mock.calls.filter((c) => c[0] === "X-RateLimit-Remaining");
      expect(remainingCalls.length).toBeGreaterThanOrEqual(3);
    });

    it("all middlewares use Retry-After on 429", (done) => {
      const simple = simpleRateLimit({ max: 1, windowMs: 60000, keyPrefix: "test_retry" });
      const auth = authRateLimit();
      const merchant = merchantApiKeyRateLimit();

      const authReq = { ...mockReq, merchantId: "merchant_789" } as AuthRequest;

      // Trigger rate limits
      simple(mockReq as Request, mockRes as Response, mockNext);
      simple(mockReq as Request, mockRes as Response, mockNext); // Exceeds

      // Auth limit
      for (let i = 0; i < 15; i++) {
        auth(mockReq as Request, mockRes as Response, mockNext);
      }

      // Merchant limit
      for (let i = 0; i < 205; i++) {
        merchant(authReq, mockRes as Response, mockNext);
      }

      const retryCalls = setHeaderSpy.mock.calls.filter((c) => c[0] === "Retry-After");
      expect(retryCalls.length).toBeGreaterThanOrEqual(3);
      done();
    });
  });
});
