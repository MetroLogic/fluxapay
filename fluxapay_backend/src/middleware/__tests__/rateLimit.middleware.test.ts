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
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
  };
}

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
    setRedisClientForTests(createMemoryRedisMock() as unknown as Redis);
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

      for (let i = 0; i < 101; i++) {
        await middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    });

    it("uses Redis-backed counters for shared rate-limit state", async () => {
      const redisMock = createMemoryRedisMock();
      setRedisClientForTests(redisMock as unknown as Redis);

      const middleware = globalRateLimit();
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(redisMock.incr).toHaveBeenCalled();
    });
  });

  describe("merchantRateLimit", () => {
    it("should allow requests within limit", async () => {
      const middleware = merchantRateLimit();
      (mockReq as any).merchantId = "test-merchant";

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should set rate limit headers", async () => {
      const middleware = merchantRateLimit();
      (mockReq as any).merchantId = "test-merchant";

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "200");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
    });
  });

  describe("authRateLimit", () => {
    it("should allow requests within limit", async () => {
      const middleware = authRateLimit();

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should set rate limit headers", async () => {
      const middleware = authRateLimit();

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "10");
    });
  });

  describe("adminRateLimit", () => {
    it("should allow admin requests within limit", async () => {
      const middleware = adminRateLimit();
      mockReq.ip = "127.0.0.10";

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should set admin rate limit headers", async () => {
      const middleware = adminRateLimit();
      mockReq.ip = "127.0.0.11";

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "60");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Window", "60");
    });

    it("should return 429 when admin limit is exceeded", async () => {
      const middleware = adminRateLimit();
      mockReq.ip = "127.0.0.12";

      for (let i = 0; i < 61; i++) {
        await middleware(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    });
  });

  describe("merchantApiKeyRateLimit", () => {
    it("should return 401 if no merchant ID", async () => {
      const middleware = merchantApiKeyRateLimit();

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it("should allow requests with valid merchant ID", async () => {
      const middleware = merchantApiKeyRateLimit();
      (mockReq as any).merchantId = "test-merchant";

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("CAPTCHA tracking", () => {
    it("should not require CAPTCHA initially", () => {
      const ip = "192.168.1.1";
      expect(checkCaptchaRequired(ip)).toBe(false);
    });

    it("should require CAPTCHA after threshold failed attempts", () => {
      const ip = "192.168.1.2";
      for (let i = 0; i < 10; i++) {
        recordFailedPaymentAttempt(ip);
      }
      expect(checkCaptchaRequired(ip)).toBe(true);
    });

    it("captchaCheck middleware should block when CAPTCHA required", () => {
      const ip = "192.168.1.3";
      for (let i = 0; i < 10; i++) {
        recordFailedPaymentAttempt(ip);
      }
      mockReq.ip = ip;

      const middleware = captchaCheck();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("Emergency blocking", () => {
    it("should not be emergency blocked initially", () => {
      expect(isEmergencyBlocked("10.0.0.1")).toBe(false);
    });

    it("should be blocked after addEmergencyBlock", () => {
      addEmergencyBlock("10.0.0.2");
      expect(isEmergencyBlocked("10.0.0.2")).toBe(true);
    });
  });
});
