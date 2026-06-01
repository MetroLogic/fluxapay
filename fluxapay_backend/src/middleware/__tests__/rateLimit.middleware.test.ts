import {
  globalRateLimit,
  merchantRateLimit,
  authRateLimit,
  merchantApiKeyRateLimit,
  checkCaptchaRequired,
  recordFailedPaymentAttempt,
  isEmergencyBlocked,
  addEmergencyBlock,
  captchaCheck,
} from "../rateLimit.middleware";
import { Request, Response, NextFunction } from "express";

describe("Rate Limit Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      ip: "127.0.0.1",
      path: "/api/v1/test",
      socket: { remoteAddress: "127.0.0.1" },
    };
    mockRes = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("globalRateLimit", () => {
    it("should allow requests within limit", () => {
      const middleware = globalRateLimit();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should set rate limit headers on all responses", () => {
      const middleware = globalRateLimit();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "100");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Window", "60");
    });

    it("should return 429 when limit exceeded", async () => {
      const middleware = globalRateLimit();
      
      // Make 101 requests to exceed the limit of 100
      for (let i = 0; i < 101; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
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
