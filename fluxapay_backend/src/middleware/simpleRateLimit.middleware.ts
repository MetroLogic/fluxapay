import type { Request, Response, NextFunction, RequestHandler } from "express";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

/**
 * simpleRateLimit.middleware.ts
 *
 * Consolidated in-memory rate limiter for public/unauthenticated endpoints.
 *
 * Routes using this middleware:
 *  - GET /api/v1/payments/{id}/status  (30 req/30s per IP:paymentId)
 *  - GET /api/v1/payments/{id}/stream  (15 req/30s per IP)
 *
 * Response Headers:
 *  - X-RateLimit-Limit: Maximum allowed requests
 *  - X-RateLimit-Remaining: Remaining requests in window
 *  - Retry-After: Seconds to wait before retry (on 429)
 */

type RateLimitOptions = {
  /**
   * Maximum number of requests allowed within `windowMs`.
   */
  max: number;
  /**
   * Rolling window size in milliseconds.
   */
  windowMs: number;
  /**
   * Optional key prefix so multiple limiters don't collide.
   */
  keyPrefix?: string;
  /**
   * Optional override for how we identify the caller.
   */
  getKey?: (req: Request) => string;
};

type Counter = { count: number; resetAt: number };
const counters = new Map<string, Counter>();

function nowMs() {
  return Date.now();
}

function getIp(req: Request) {
  // Express `req.ip` respects `trust proxy` when configured at the app level.
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function simpleRateLimit(options: RateLimitOptions): RequestHandler {
  const { max, windowMs, keyPrefix = "rl", getKey } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${getKey ? getKey(req) : getIp(req)}`;
    const t = nowMs();

    const existing = counters.get(key);
    if (!existing || existing.resetAt <= t) {
      counters.set(key, { count: 1, resetAt: t + windowMs });
      // Set standard rate limit headers on success
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(max - 1));
      return next();
    }

    existing.count += 1;
    const remaining = Math.max(0, max - existing.count);

    // Set standard rate limit headers on all responses
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

