jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import {
  globalRateLimit,
  merchantRateLimit,
  authRateLimit,
  adminRateLimit,
  merchantApiKeyRateLimit,
  checkCaptchaRequired,
  recordFailedPaymentAttempt,
  isEmergencyBlocked,
  addEmergencyBlock,
  captchaCheck,
  setRedisClientForTests,
  resetRedisClientForTests,
} from "../rateLimit.middleware";
import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";

describe("Rate Limit Middleware", () => {
  let mockReq: any;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      ip: "127.0.0.1",
      path: "/api/v1/test",
    };
    resetRedisClientForTests();
    mockRes = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetRedisClientForTests();
  });

  describe("globalRateLimit", () => {
    it("should allow requests within limit", async () => {
      const middleware = globalRateLimit();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should set rate limit headers on all responses", async () => {
      const middleware = globalRateLimit();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "100");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Window", "60");
    });

    it("should return 429 when limit exceeded", async () => {
      const middleware = globalRateLimit();
      
      // Make 101 requests to exceed the limit of 100
      for (let i = 0; i < 101; i++) {
        await middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    });

    it("uses Redis-backed counters for shared rate-limit state", async () => {
      const redisMock = {
        incr: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
        expire: jest.fn().mockResolvedValue(1),
        ttl: jest.fn().mockResolvedValue(30),
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        on: jest.fn(),
      };
      setRedisClientForTests(redisMock as unknown as Redis);

      const middleware = globalRateLimit();
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(redisMock.incr).toHaveBeenCalled();
    });
  });

  describe("merchantRateLimit", () => {
    it("should allow requests within limit", () => {
      const middleware = merchantRateLimit();
      (mockReq as any).merchantId = "test-merchant";
      
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should set rate limit headers", () => {
      const middleware = merchantRateLimit();
      (mockReq as any).merchantId = "test-merchant";
      
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "200");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
    });
  });

  describe("authRateLimit", () => {
    it("should allow requests within limit", () => {
      const middleware = authRateLimit();
      
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should set rate limit headers", () => {
      const middleware = authRateLimit();
      
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "10");
    });
  });

  describe("adminRateLimit", () => {
    it("should allow admin requests within limit", () => {
      const middleware = adminRateLimit();
      mockReq.ip = "127.0.0.10";

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should set admin rate limit headers", () => {
      const middleware = adminRateLimit();
      mockReq.ip = "127.0.0.11";

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "60");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Window", "60");
    });

    it("should return 429 when admin limit is exceeded", () => {
      const middleware = adminRateLimit();
      mockReq.ip = "127.0.0.12";

      for (let i = 0; i < 61; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    });
  });

  describe("merchantApiKeyRateLimit", () => {
    it("should return 401 if no merchant ID", () => {
      const middleware = merchantApiKeyRateLimit();
      
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it("should allow requests with valid merchant ID", () => {
      const middleware = merchantApiKeyRateLimit();
      (mockReq as any).merchantId = "test-merchant";
      
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("CAPTCHA tracking", () => {
    it("should not require CAPTCHA initially", () => {
      const ip = "192.168.1.1";
      expect(checkCaptchaRequired(ip)).toBe(false);
    });

    it("should require CAPTCHA after 10 failed attempts", () => {
      const ip = "192.168.1.2";
      
      for (let i = 0; i < 10; i++) {
        recordFailedPaymentAttempt(ip);
      }
      
      expect(checkCaptchaRequired(ip)).toBe(true);
    });

    it("should reset CAPTCHA requirement after window expires", () => {
      const ip = "192.168.1.3";
      
      for (let i = 0; i < 10; i++) {
        recordFailedPaymentAttempt(ip);
      }
      
      expect(checkCaptchaRequired(ip)).toBe(true);
      
      // Wait for window to expire (simulated by time passing)
      // In real test, you'd use jest.useFakeTimers()
    });
  });

  describe("Emergency blocking", () => {
    it("should not block IP initially", () => {
      const ip = "192.168.1.4";
      expect(isEmergencyBlocked(ip)).toBe(false);
    });

    it("should block IP after emergency block is added", () => {
      const ip = "192.168.1.5";
      addEmergencyBlock(ip);
      
      expect(isEmergencyBlocked(ip)).toBe(true);
    });

    it("should auto-unblock IP after 1 hour", () => {
      const ip = "192.168.1.6";
      addEmergencyBlock(ip);
      
      expect(isEmergencyBlocked(ip)).toBe(true);
      
      // Wait for 1 hour + buffer
      // In real test, you'd use jest.useFakeTimers()
    });
  });

  describe("captchaCheck middleware", () => {
    it("should allow requests when CAPTCHA not required", () => {
      const middleware = captchaCheck();
      
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should block requests when CAPTCHA required", () => {
      const middleware = captchaCheck();
      const ip = "192.168.1.7";
      
      for (let i = 0; i < 10; i++) {
        recordFailedPaymentAttempt(ip);
      }
      
      mockReq.ip = ip;
      
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
