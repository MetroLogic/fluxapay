import type { Request, Response, NextFunction, RequestHandler } from "express";
import Redis from "ioredis";
import * as crypto from "crypto";
import { ErrorCode, ErrorCodeType } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { AuthRequest } from "../types/express";
import { isDevEnv } from "../helpers/env.helper";
import { getRedisClientForRateLimit } from "./rateLimit.middleware";

/**
 * Lua script for atomic sliding window rate limiting in Redis.
 *
 * Uses a Redis Sorted Set (ZSET) where:
 * - score: request timestamp in milliseconds
 * - member: unique string `${timestamp}:${uuid}`
 *
 * Operations in single atomic execution:
 * 1. ZREMRANGEBYSCORE: Prune expired records outside the window [0, now - windowMs].
 * 2. ZCARD: Count active requests inside the current sliding window.
 * 3. Check limit:
 *    - If count >= max: reject and compute retryAfter from oldest timestamp.
 *    - If count < max: record current request via ZADD.
 * 4. EXPIRE: Set/refresh key TTL to prevent orphaned keys in Redis.
 *
 * Returns: { allowed (1 or 0), currentCount, retryAfterMs }
 */
const SLIDING_WINDOW_LUA_SCRIPT = `
local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local maxLimit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local member = ARGV[4]
local ttlSeconds = tonumber(ARGV[5])

local clearBefore = now - windowMs

-- 1. Remove expired entries older than the sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)

-- 2. Count active requests in current window
local currentCount = redis.call('ZCARD', key)

local allowed = 1
local retryAfterMs = 0

if currentCount >= maxLimit then
  allowed = 0
  -- Fetch the score of the oldest request in the window to determine retry-after
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  if #oldest >= 2 then
    local oldestScore = tonumber(oldest[2])
    retryAfterMs = (oldestScore + windowMs) - now
    if retryAfterMs < 0 then
      retryAfterMs = 0
    end
  else
    retryAfterMs = windowMs
  end
else
  -- 3. Add current request to the sliding window
  redis.call('ZADD', key, now, member)
  currentCount = currentCount + 1
end

-- 4. Refresh TTL to auto-expire idle keys
redis.call('EXPIRE', key, ttlSeconds)

return { allowed, currentCount, retryAfterMs }
`;

export interface SlidingWindowRateLimitOptions {
  /** Maximum number of allowed requests within the window. */
  max: number | (() => number);
  /** Rolling window duration in milliseconds. */
  windowMs: number | (() => number);
  /** Key prefix to prevent collision across different limiters. */
  keyPrefix?: string;
  /** Custom function to derive client identifier. */
  getKey?: (req: Request) => string | Promise<string>;
  /** Client identifier strategy: 'ip' | 'apiKey' | 'auto'. Default: 'auto'. */
  clientIdentifierType?: "ip" | "apiKey" | "auto";
  /** Custom message when limit is exceeded. */
  message?: string;
  /** Custom error code from ErrorCode. Default: RATE_LIMIT_EXCEEDED. */
  errorCode?: ErrorCodeType;
  /** Whether to fail closed when Redis is unavailable. Default: false (falls back to memory counter). */
  failClosed?: boolean;
}

export interface SlidingWindowResult {
  allowed: boolean;
  currentCount: number;
  remaining: number;
  retryAfterSeconds: number;
}

/** In-memory sliding window store used as an intelligent fallback during Redis blips. */
const inMemorySlidingWindowCounters = new Map<string, number[]>();

let testRedisClient: Redis | null = null;

export function setSlidingWindowRedisClientForTests(client: Redis | null): void {
  testRedisClient = client;
}

export function resetSlidingWindowRedisClientForTests(): void {
  testRedisClient = null;
}

export function clearInMemorySlidingWindowCounters(): void {
  inMemorySlidingWindowCounters.clear();
}

/**
 * Safely parse a positive integer from environment variables or inputs.
 * Returns the fallback if undefined, null, non-numeric, zero, or negative.
 */
export function parsePositiveInt(val: unknown, fallback: number): number {
  if (val === undefined || val === null || val === "") return fallback;
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

/**
 * Extracts the trusted client IP.
 * Does NOT read raw spoofable headers (e.g. X-Forwarded-For) unless Express
 * 'trust proxy' is explicitly enabled, falling back to the direct socket address.
 */
export function getTrustedClientIp(req: Request): string {
  if (req.ip && typeof req.ip === "string" && req.ip.trim() !== "") {
    return req.ip.trim();
  }
  const remote = req.socket?.remoteAddress;
  if (remote && typeof remote === "string" && remote.trim() !== "") {
    return remote.trim();
  }
  return "127.0.0.1";
}

/**
 * Derives a client identifier based on the endpoint's authentication model.
 * - 'apiKey': Uses authenticated merchantId, user.id, or validated API key.
 * - 'ip': Uses trusted client IP.
 * - 'auto': Prefers authenticated identity when available, falling back to client IP.
 */
export function getClientIdentifier(
  req: Request,
  type: "ip" | "apiKey" | "auto" = "auto",
): string {
  const authReq = req as AuthRequest;

  if (type === "apiKey" || type === "auto") {
    if (authReq.merchantId && typeof authReq.merchantId === "string") {
      return `merchant:${authReq.merchantId}`;
    }
    if (authReq.user?.id && typeof authReq.user.id === "string") {
      return `user:${authReq.user.id}`;
    }
    const headerKey = req.headers["x-api-key"];
    if (typeof headerKey === "string" && headerKey.trim()) {
      const hashed = crypto.createHash("sha256").update(headerKey.trim()).digest("hex").slice(0, 16);
      return `apikey:${hashed}`;
    }
    if (type === "apiKey") {
      return `key:unauth:${getTrustedClientIp(req)}`;
    }
  }

  return `ip:${getTrustedClientIp(req)}`;
}

/**
 * Evaluate sliding window rate limit using in-memory fallback.
 * Guarantees that rate limiting is not silently disabled when Redis is down.
 */
function checkInMemorySlidingWindow(
  key: string,
  max: number,
  windowMs: number,
  now: number,
): SlidingWindowResult {
  const clearBefore = now - windowMs;
  let timestamps = inMemorySlidingWindowCounters.get(key) || [];
  timestamps = timestamps.filter((t) => t > clearBefore);

  let allowed = true;
  let retryAfterSeconds = 0;
  let currentCount = timestamps.length;

  if (currentCount >= max) {
    allowed = false;
    const oldest = timestamps[0] || clearBefore;
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  } else {
    timestamps.push(now);
    currentCount += 1;
  }

  inMemorySlidingWindowCounters.set(key, timestamps);
  const remaining = Math.max(0, max - currentCount);

  return {
    allowed,
    currentCount,
    remaining,
    retryAfterSeconds,
  };
}

/**
 * Execute atomic sliding window check against Redis with deliberate error handling.
 */
export async function checkSlidingWindowLimit(
  redisClient: Redis | null,
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
  options: { failClosed?: boolean } = {},
): Promise<SlidingWindowResult> {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const ttlSeconds = windowSeconds + 5; // buffer TTL

  if (redisClient && typeof (redisClient as any).eval === "function") {
    try {
      const uniqueMember = `${now}:${crypto.randomUUID()}`;
      const result = await (redisClient as any).eval(
        SLIDING_WINDOW_LUA_SCRIPT,
        1,
        key,
        windowMs,
        max,
        now,
        uniqueMember,
        ttlSeconds,
      );

      if (Array.isArray(result) && result.length >= 3) {
        const allowed = Number(result[0]) === 1;
        const currentCount = Number(result[1]);
        const retryAfterMs = Number(result[2]);
        const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil(retryAfterMs / 1000));
        const remaining = Math.max(0, max - currentCount);

        return {
          allowed,
          currentCount,
          remaining,
          retryAfterSeconds,
        };
      }
    } catch (err: unknown) {
      if (isDevEnv()) {
        console.warn(
          `[RateLimit] Redis error checking sliding window for key "${key}":`,
          err instanceof Error ? err.message : err,
        );
      }

      if (options.failClosed) {
        return {
          allowed: false,
          currentCount: max,
          remaining: 0,
          retryAfterSeconds: windowSeconds,
        };
      }
      // Deliberate fallback: enforce sliding window in-memory so traffic is not unthrottled
      return checkInMemorySlidingWindow(key, max, windowMs, now);
    }
  }

  // Handle mock clients that implement incr/ttl (for legacy test compatibility)
  if (redisClient && typeof (redisClient as any).incr === "function" && typeof (redisClient as any).eval !== "function") {
    try {
      const current = await (redisClient as any).incr(key);
      if (current === 1 && typeof (redisClient as any).expire === "function") {
        await (redisClient as any).expire(key, windowSeconds);
      }
      let ttl = windowSeconds;
      if (typeof (redisClient as any).ttl === "function") {
        const t = await (redisClient as any).ttl(key);
        if (t > 0) ttl = t;
      }
      const allowed = current <= max;
      return {
        allowed,
        currentCount: current,
        remaining: Math.max(0, max - current),
        retryAfterSeconds: allowed ? 0 : ttl,
      };
    } catch {
      return checkInMemorySlidingWindow(key, max, windowMs, now);
    }
  }

  // No active Redis client — use in-memory sliding window
  return checkInMemorySlidingWindow(key, max, windowMs, now);
}

/**
 * Factory creating reusable Express middleware backed by Redis sliding-window counters.
 */
export function createSlidingWindowRateLimiter(
  options: SlidingWindowRateLimitOptions,
): RequestHandler {
  const {
    max: maxOpt,
    windowMs: windowMsOpt,
    keyPrefix = "rl:sw",
    getKey,
    clientIdentifierType = "auto",
    message = "Too many requests. Please slow down.",
    errorCode = ErrorCode.RATE_LIMIT_EXCEEDED,
    failClosed = process.env.RATE_LIMIT_FAIL_CLOSED === "true",
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const max = typeof maxOpt === "function" ? maxOpt() : maxOpt;
    const windowMs = typeof windowMsOpt === "function" ? windowMsOpt() : windowMsOpt;
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

    const identifier = getKey
      ? await getKey(req)
      : getClientIdentifier(req, clientIdentifierType);

    const key = `${keyPrefix}:${identifier}`;
    const redis = testRedisClient || getRedisClientForRateLimit();

    const { allowed, remaining, retryAfterSeconds } = await checkSlidingWindowLimit(
      redis,
      key,
      max,
      windowMs,
      Date.now(),
      { failClosed },
    );

    // Set standard rate-limit headers on all responses
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Window", String(windowSeconds));

    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      sendApiError(
        res,
        apiError(429, errorCode, message, {
          retryAfterSeconds,
        }),
      );
      return;
    }

    next();
  };
}

/**
 * Public Payment Status Sliding-Window Limiter.
 * Protects GET /api/v1/payments/:id/status by IP and payment ID.
 */
export function publicPaymentStatusRateLimit(): RequestHandler {
  return createSlidingWindowRateLimiter({
    keyPrefix: "payments:status",
    max: () => parsePositiveInt(process.env.PAYMENT_STATUS_RATE_MAX, 30),
    windowMs: () => parsePositiveInt(process.env.PAYMENT_STATUS_WINDOW_MS, 30_000),
    getKey: (req) => {
      const ip = getTrustedClientIp(req);
      const paymentId = req.params?.id || "unknown";
      return `${ip}:${paymentId}`;
    },
    message: "Payment status check rate limit exceeded. Please try again later.",
  });
}

/**
 * Public Payment Stream Sliding-Window Limiter.
 * Protects GET /api/v1/payments/:id/stream by IP.
 */
export function publicPaymentStreamRateLimit(): RequestHandler {
  return createSlidingWindowRateLimiter({
    keyPrefix: "payments:stream",
    max: () => parsePositiveInt(process.env.PAYMENT_STREAM_RATE_MAX, 15),
    windowMs: () => parsePositiveInt(process.env.PAYMENT_STREAM_WINDOW_MS, 30_000),
    getKey: (req) => getTrustedClientIp(req),
    message: "Payment stream rate limit exceeded. Please try again later.",
  });
}

/**
 * Public Checkout Payment Details and Status Limiter.
 * Protects hosted checkout routes (/payments/checkout/:id and /status) by IP.
 */
export function publicCheckoutRateLimit(): RequestHandler {
  return createSlidingWindowRateLimiter({
    keyPrefix: "payments:checkout",
    max: () => parsePositiveInt(process.env.PUBLIC_CHECKOUT_RATE_MAX, 60),
    windowMs: () => parsePositiveInt(process.env.PUBLIC_CHECKOUT_WINDOW_MS, 60_000),
    getKey: (req) => {
      const ip = getTrustedClientIp(req);
      const id = req.params?.id || "";
      return id ? `${ip}:${id}` : ip;
    },
    message: "Checkout rate limit exceeded. Please try again later.",
  });
}

/**
 * Charges Rate Limiter.
 * Protects charge and refund endpoints by API key / merchant with IP fallback.
 */
export function chargesRateLimit(): RequestHandler {
  return createSlidingWindowRateLimiter({
    keyPrefix: "charges",
    max: () =>
      parsePositiveInt(
        process.env.CHARGES_RATE_LIMIT_MAX || process.env.MERCHANT_API_KEY_RATE_MAX,
        200,
      ),
    windowMs: () =>
      parsePositiveInt(
        process.env.CHARGES_RATE_LIMIT_WINDOW_MS || process.env.MERCHANT_API_KEY_RATE_WINDOW_MS,
        60_000,
      ),
    clientIdentifierType: "apiKey",
    message: "Rate limit exceeded for charges. Please slow down.",
  });
}
