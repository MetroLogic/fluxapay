import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AuthRequest } from "../types/express";

/**
 * Rate Limiting Middleware
 *
 * Provides two tiers:
 * 1. Global rate limit for public/unauthenticated API routes (by IP)
 * 2. Per-merchant rate limit for authenticated private routes (by merchantId)
 *
 * Uses an in-memory sliding window counter. For multi-instance deployments,
 * replace the Map store with a Redis-backed implementation.
 */

type Counter = { count: number; resetAt: number };
const store = new Map<string, Counter>();

function nowMs(): number {
  return Date.now();
}

function getIp(req: Request): string {
  // Respects trust proxy setting on the Express app
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function checkLimit(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const t = nowMs();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= t) {
    store.set(key, { count: 1, resetAt: t + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - t) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Global rate limit for public API routes (keyed by IP).
 *
 * Default: 100 requests per 60 seconds per IP.
 * Configurable via env vars:
 *   GLOBAL_RATE_LIMIT_MAX        (default: 100)
 *   GLOBAL_RATE_LIMIT_WINDOW_MS  (default: 60000)
 */
export function globalRateLimit(): RequestHandler {
  const max = parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || "100", 10);
  const windowMs = parseInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || "60000", 10);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `global:${getIp(req)}`;
    const { allowed, retryAfterSeconds } = checkLimit(key, max, windowMs);

    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please slow down.",
          retry_after_seconds: retryAfterSeconds,
        },
      });
    }

    next();
  };
}

/**
 * Per-merchant rate limit for authenticated private API routes.
 * Falls back to IP-based limiting if no merchantId is present.
 *
 * Default: 200 requests per 60 seconds per merchant.
 * Configurable via env vars:
 *   MERCHANT_RATE_LIMIT_MAX        (default: 200)
 *   MERCHANT_RATE_LIMIT_WINDOW_MS  (default: 60000)
 */
export function merchantRateLimit(): RequestHandler {
  const max = parseInt(process.env.MERCHANT_RATE_LIMIT_MAX || "200", 10);
  const windowMs = parseInt(process.env.MERCHANT_RATE_LIMIT_WINDOW_MS || "60000", 10);

  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const identifier = authReq.merchantId || getIp(req);
    const key = `merchant:${identifier}`;
    const { allowed, retryAfterSeconds } = checkLimit(key, max, windowMs);

    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Per-merchant rate limit exceeded. Please slow down.",
          retry_after_seconds: retryAfterSeconds,
        },
      });
    }

    next();
  };
}

/**
 * Strict rate limit for sensitive auth endpoints (login, OTP, signup).
 *
 * Default: 10 requests per 15 minutes per IP.
 * Configurable via env vars:
 *   AUTH_RATE_LIMIT_MAX        (default: 10)
 *   AUTH_RATE_LIMIT_WINDOW_MS  (default: 900000)
 */
export function authRateLimit(): RequestHandler {
  const max = parseInt(process.env.AUTH_RATE_LIMIT_MAX || "10", 10);
  const windowMs = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "900000", 10);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `auth:${getIp(req)}`;
    const { allowed, retryAfterSeconds } = checkLimit(key, max, windowMs);

    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many authentication attempts. Please try again later.",
          retry_after_seconds: retryAfterSeconds,
        },
      });
    }

    next();
  };
}
