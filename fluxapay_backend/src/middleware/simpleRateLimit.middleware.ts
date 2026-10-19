import type { Request, Response, NextFunction, RequestHandler } from "express";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { getTrustedClientIp } from "./slidingWindowRateLimit.middleware";

/**
 * simpleRateLimit.middleware.ts
 *
 * In-memory fallback rate limiter for non-distributed contexts.
 *
 * Response Headers:
 *  - X-RateLimit-Limit: Maximum allowed requests
 *  - X-RateLimit-Remaining: Remaining requests in window
 *  - Retry-After: Seconds to wait before retry (on 429)
 */

export type RateLimitOptions = {
  /** Maximum number of requests allowed within `windowMs`. */
  max: number;
  /** Rolling window size in milliseconds. */
  windowMs: number;
  /** Optional key prefix so multiple limiters don't collide. */
  keyPrefix?: string;
  /** Optional override for how we identify the caller. */
  getKey?: (req: Request) => string;
};

type Counter = { count: number; resetAt: number };
const counters = new Map<string, Counter>();

function nowMs() {
  return Date.now();
}

export function simpleRateLimit(options: RateLimitOptions): RequestHandler {
  const { max, windowMs, keyPrefix = "rl", getKey } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${getKey ? getKey(req) : getTrustedClientIp(req)}`;
    const t = nowMs();

    const existing = counters.get(key);
    if (!existing || existing.resetAt <= t) {
      counters.set(key, { count: 1, resetAt: t + windowMs });
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(max - 1));
      return next();
    }

    existing.count += 1;
    const remaining = Math.max(0, max - existing.count);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (existing.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - t) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return sendApiError(
        res,
        apiError(429, ErrorCode.RATE_LIMIT_EXCEEDED, "Rate limit exceeded", {
          retryAfterSeconds,
        }),
      );
    }

    return next();
  };
}
