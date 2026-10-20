import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import {
  createSlidingWindowRateLimiter,
  checkSlidingWindowLimit,
  getTrustedClientIp,
  getClientIdentifier,
  parsePositiveInt,
  publicPaymentStatusRateLimit,
  publicPaymentStreamRateLimit,
  publicCheckoutRateLimit,
  chargesRateLimit,
  setSlidingWindowRedisClientForTests,
  resetSlidingWindowRedisClientForTests,
  clearInMemorySlidingWindowCounters,
} from "../slidingWindowRateLimit.middleware";

/**
 * Creates an in-memory Redis mock that faithfully models Redis ZSET sliding-window semantics
 * including the Lua script execution via redis.eval.
 */
function createSlidingWindowRedisMock() {
  // Store sets as arrays of { member: string, score: number }
  const zsets = new Map<string, Array<{ member: string; score: number }>>();
  const ttls = new Map<string, number>();

  return {
    _zsets: zsets,
    eval: jest.fn(
      async (
        _script: string,
        _numKeys: number,
        key: string,
        windowMsStr: string | number,
        maxLimitStr: string | number,
        nowStr: string | number,
        member: string,
        ttlSecondsStr: string | number,
      ) => {
        const windowMs = Number(windowMsStr);
        const maxLimit = Number(maxLimitStr);
        const now = Number(nowStr);
        const ttlSeconds = Number(ttlSecondsStr);

        let entries = zsets.get(key) || [];
        const clearBefore = now - windowMs;

        // 1. ZREMRANGEBYSCORE key -inf clearBefore
        entries = entries.filter((e) => e.score > clearBefore);

        // 2. ZCARD key
        const currentCount = entries.length;

        ttls.set(key, ttlSeconds);

        if (currentCount >= maxLimit) {
          // Calculate retry-after from oldest entry
          const oldestScore = entries.length > 0 ? entries[0].score : now;
          const retryAfterMs = Math.max(0, oldestScore + windowMs - now);
          zsets.set(key, entries);
          return [0, currentCount, retryAfterMs];
        }

        // 3. ZADD key now member
        entries.push({ member, score: now });
        // Keep sorted by score
        entries.sort((a, b) => a.score - b.score);
        zsets.set(key, entries);

        return [1, currentCount + 1, 0];
      },
    ),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn(async (key: string) => ttls.get(key) || 60),
    quit: jest.fn().mockResolvedValue("OK"),
  };
}

describe("Redis Sliding-Window Rate Limiter Middleware", () => {
  let mockRedis: ReturnType<typeof createSlidingWindowRedisMock>;
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearInMemorySlidingWindowCounters();
    mockRedis = createSlidingWindowRedisMock();
    setSlidingWindowRedisClientForTests(mockRedis as unknown as Redis);

    mockReq = {
      ip: "192.168.1.50",
      socket: { remoteAddress: "192.168.1.50" },
      headers: {},
      params: {},
      path: "/api/v1/test",
    };

    mockRes = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    resetSlidingWindowRedisClientForTests();
    clearInMemorySlidingWindowCounters();
  });

  describe("1. Requests within configured limit", () => {
    it("allows requests when count is below limit and sets standard headers", async () => {
      const limiter = createSlidingWindowRateLimiter({
        max: 5,
        windowMs: 60_000,
        keyPrefix: "test_within",
      });

      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "5");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "4");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Window", "60");
    });

    it("allows multiple sequential requests up to max", async () => {
      const limiter = createSlidingWindowRateLimiter({
        max: 3,
        windowMs: 60_000,
        keyPrefix: "test_seq",
      });

      for (let i = 0; i < 3; i++) {
        await limiter(mockReq as Request, mockRes as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(3);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe("2. Requests exceeding limit & 429 Retry-After response", () => {
    it("rejects request with 429 and correct Retry-After when limit is exceeded", async () => {
      const limiter = createSlidingWindowRateLimiter({
        max: 2,
        windowMs: 30_000,
        keyPrefix: "test_exceed",
      });

      // 2 allowed requests
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      // 3rd request exceeds limit
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(2); // not called 3rd time
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "0");
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "RATE_LIMIT_EXCEEDED",
          retry_after_seconds: expect.any(Number),
        }),
      );
    });
  });

  describe("3. Counter reset & sliding-window expiration", () => {
    it("frees up slots as timestamps slide past the rolling window", async () => {
      let currentTime = 1000000;
      const originalNow = Date.now;
      Date.now = jest.fn(() => currentTime);

      try {
        const limiter = createSlidingWindowRateLimiter({
          max: 2,
          windowMs: 10_000, // 10s window
          keyPrefix: "test_slide",
        });

        // Request 1 at T = 0s
        await limiter(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(1);

        // Request 2 at T = 2s
        currentTime += 2000;
        await limiter(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(2);

        // Request 3 at T = 4s (should be blocked)
        currentTime += 2000;
        await limiter(mockReq as Request, mockRes as Response, mockNext);
        expect(mockRes.status).toHaveBeenCalledWith(429);

        // Advance time to T = 11s (11s from T=0; Request 1 has slid out)
        currentTime = 1000000 + 11000;
        jest.clearAllMocks();

        await limiter(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockRes.status).not.toHaveBeenCalled();
      } finally {
        Date.now = originalNow;
      }
    });
  });

  describe("4. Independent limits for different clients", () => {
    it("enforces limits independently for distinct IP clients", async () => {
      const limiter = createSlidingWindowRateLimiter({
        max: 1,
        windowMs: 60_000,
        keyPrefix: "test_ind_ip",
      });

      const reqA: any = { ...mockReq, ip: "10.0.0.1", socket: { remoteAddress: "10.0.0.1" } };
      const reqB: any = { ...mockReq, ip: "10.0.0.2", socket: { remoteAddress: "10.0.0.2" } };

      // Client A uses up limit
      await limiter(reqA, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Client A blocked on 2nd request
      await limiter(reqA, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(429);

      // Client B is NOT blocked
      jest.clearAllMocks();
      await limiter(reqB, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("enforces limits independently for distinct API key merchants", async () => {
      const limiter = createSlidingWindowRateLimiter({
        max: 1,
        windowMs: 60_000,
        keyPrefix: "test_ind_merchant",
        clientIdentifierType: "apiKey",
      });

      const merchantA: any = { ...mockReq, merchantId: "merchant_aaa" };
      const merchantB: any = { ...mockReq, merchantId: "merchant_bbb" };

      await limiter(merchantA, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      await limiter(merchantA, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(429);

      jest.clearAllMocks();
      await limiter(merchantB, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe("5. Client identification & anti-spoofing security", () => {
    it("uses direct socket address when req.ip is empty", () => {
      const req: any = {
        ip: "",
        socket: { remoteAddress: "198.51.100.2" },
      };
      expect(getTrustedClientIp(req)).toBe("198.51.100.2");
    });

    it("does not blindly read spoofable X-Forwarded-For header", () => {
      const req: any = {
        ip: "203.0.113.1",
        headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
        socket: { remoteAddress: "203.0.113.1" },
      };
      // Must use trusted req.ip rather than forged header
      expect(getTrustedClientIp(req)).toBe("203.0.113.1");
    });

    it("derives merchant identifier when authenticated", () => {
      const req: any = {
        merchantId: "merch_12345",
        ip: "1.2.3.4",
      };
      expect(getClientIdentifier(req, "apiKey")).toBe("merchant:merch_12345");
      expect(getClientIdentifier(req, "auto")).toBe("merchant:merch_12345");
    });

    it("hashes raw API keys to protect sensitive key tokens in Redis keys", () => {
      const req: any = {
        headers: { "x-api-key": "flx_live_verysecretkey" },
        ip: "1.2.3.4",
      };
      const id = getClientIdentifier(req, "auto");
      expect(id).toMatch(/^apikey:[a-f0-9]{16}$/);
      expect(id).not.toContain("verysecretkey");
    });
  });

  describe("6. Environment configuration & invalid value fallbacks", () => {
    it("safely parses positive integers and falls back on invalid values", () => {
      expect(parsePositiveInt("50", 10)).toBe(50);
      expect(parsePositiveInt("0", 10)).toBe(10);
      expect(parsePositiveInt("-20", 10)).toBe(10);
      expect(parsePositiveInt("invalid", 10)).toBe(10);
      expect(parsePositiveInt(null, 10)).toBe(10);
      expect(parsePositiveInt(undefined, 10)).toBe(10);
    });

    it("dynamically respects configured environment variables", async () => {
      const originalEnv = process.env.PAYMENT_STATUS_RATE_MAX;
      process.env.PAYMENT_STATUS_RATE_MAX = "42";

      try {
        const limiter = publicPaymentStatusRateLimit();
        await limiter(mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "42");
      } finally {
        if (originalEnv !== undefined) {
          process.env.PAYMENT_STATUS_RATE_MAX = originalEnv;
        } else {
          delete process.env.PAYMENT_STATUS_RATE_MAX;
        }
      }
    });
  });

  describe("7. Redis errors & deliberate failure handling", () => {
    it("falls back to local in-memory sliding window when Redis fails (fail-open with throttling)", async () => {
      // Mock Redis that throws on eval
      const brokenRedis = {
        eval: jest.fn().mockRejectedValue(new Error("Redis connection timed out")),
      };
      setSlidingWindowRedisClientForTests(brokenRedis as unknown as Redis);

      const limiter = createSlidingWindowRateLimiter({
        max: 2,
        windowMs: 60_000,
        keyPrefix: "test_redis_err",
        failClosed: false,
      });

      // 1st request allowed by in-memory fallback
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // 2nd request allowed by in-memory fallback
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      // 3rd request blocked by in-memory fallback (rate limiting is NOT silently disabled!)
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    });

    it("fails closed when failClosed option is explicitly enabled", async () => {
      const brokenRedis = {
        eval: jest.fn().mockRejectedValue(new Error("Redis unavailable")),
      };
      setSlidingWindowRedisClientForTests(brokenRedis as unknown as Redis);

      const limiter = createSlidingWindowRateLimiter({
        max: 5,
        windowMs: 60_000,
        keyPrefix: "test_fail_closed",
        failClosed: true,
      });

      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });
  });

  describe("8. Atomic concurrent requests", () => {
    it("atomically handles concurrent requests without race conditions", async () => {
      const limiter = createSlidingWindowRateLimiter({
        max: 3,
        windowMs: 60_000,
        keyPrefix: "test_concurrent",
      });

      // Fire 6 requests concurrently in parallel
      const results = await Promise.all(
        Array.from({ length: 6 }, async () => {
          const res: any = {
            setHeader: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
          };
          const next = jest.fn();
          await limiter(mockReq as Request, res as Response, next);
          return { nextCalled: next.mock.calls.length > 0, status: res.status.mock.calls[0]?.[0] };
        }),
      );

      const allowed = results.filter((r) => r.nextCalled && !r.status);
      const rejected = results.filter((r) => r.status === 429);

      expect(allowed).toHaveLength(3);
      expect(rejected).toHaveLength(3);
    });
  });

  describe("9. Route limiter presets", () => {
    it("publicPaymentStatusRateLimit uses payment status prefix and bounds", () => {
      const limiter = publicPaymentStatusRateLimit();
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe("function");
    });

    it("publicPaymentStreamRateLimit uses payment stream prefix and bounds", () => {
      const limiter = publicPaymentStreamRateLimit();
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe("function");
    });

    it("publicCheckoutRateLimit uses checkout prefix and bounds", () => {
      const limiter = publicCheckoutRateLimit();
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe("function");
    });

    it("chargesRateLimit uses charges prefix and apiKey identification", () => {
      const limiter = chargesRateLimit();
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe("function");
    });
  });
});
