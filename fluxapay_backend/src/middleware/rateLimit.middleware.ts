import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AuthRequest } from "../types/express";
import { PrismaClient } from "../generated/client/client";
import { isDevEnv } from "../helpers/env.helper";

const prisma = new PrismaClient();

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

// Emergency circuit breaker for IPs with >500 req/min
const emergencyBlockedIPs = new Set<string>();

// CAPTCHA tracking for IPs with failed payment attempts
const captchaRequiredIPs = new Map<string, { attempts: number; windowStart: number; required: boolean }>();

const FAILED_PAYMENT_THRESHOLD = 10;
const FAILED_PAYMENT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EMERGENCY_THRESHOLD = 500;
const EMERGENCY_WINDOW_MS = 60 * 1000; // 1 minute

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
): { allowed: boolean; retryAfterSeconds: number; remaining: number } {
  const t = nowMs();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= t) {
    store.set(key, { count: 1, resetAt: t + windowMs });
    return { allowed: true, retryAfterSeconds: 0, remaining: max - 1 };
  }

  existing.count += 1;

  if (existing.count > max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - t) / 1000));
    return { allowed: false, retryAfterSeconds, remaining: 0 };
  }

  return { allowed: true, retryAfterSeconds: 0, remaining: max - existing.count };
}

/**
 * Log rate limit event to database
 */
async function logRateLimitEvent(data: {
  ipAddress: string;
  endpoint: string;
  limitType: string;
  retryAfterSeconds: number;
}) {
  try {
    await prisma.rateLimitLog.create({
      data: {
        ip_address: data.ipAddress,
        endpoint: data.endpoint,
        limit_type: data.limitType,
        retry_after_seconds: data.retryAfterSeconds,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    if (isDevEnv()) {
      console.error("Failed to log rate limit event:", error);
    }
  }
}

/**
 * Check if IP requires CAPTCHA due to failed payment attempts
 */
export function checkCaptchaRequired(ip: string): boolean {
  const now = nowMs();
  const windowStart = now - FAILED_PAYMENT_WINDOW_MS;
  
  let data = captchaRequiredIPs.get(ip);
  
  if (!data || data.windowStart < windowStart) {
    data = { attempts: 0, windowStart: now, required: false };
    captchaRequiredIPs.set(ip, data);
  }
  
  return data.required;
}

/**
 * Record failed payment attempt for CAPTCHA tracking
 */
export function recordFailedPaymentAttempt(ip: string) {
  const now = nowMs();
  const windowStart = now - FAILED_PAYMENT_WINDOW_MS;
  
  let data = captchaRequiredIPs.get(ip);
  
  if (!data || data.windowStart < windowStart) {
    data = { attempts: 1, windowStart: now, required: false };
  } else {
    data.attempts++;
  }
  
  if (data.attempts >= FAILED_PAYMENT_THRESHOLD) {
    data.required = true;
  }
  
  captchaRequiredIPs.set(ip, data);
}

/**
 * Check if IP is emergency blocked (>500 req/min)
 */
export function isEmergencyBlocked(ip: string): boolean {
  return emergencyBlockedIPs.has(ip);
}

/**
 * Add IP to emergency block list
 */
export function addEmergencyBlock(ip: string) {
  emergencyBlockedIPs.add(ip);
  
  // Auto-remove after 1 hour
  setTimeout(() => {
    emergencyBlockedIPs.delete(ip);
  }, 60 * 60 * 1000);
}

/**
 * Global rate limit for public API traffic (keyed by IP).
 *
 * Default: 100 requests per 60 seconds per IP.
 * Configurable via env vars:
 *   PUBLIC_API_IP_RATE_MAX          (alias, preferred)
 *   GLOBAL_RATE_LIMIT_MAX           (legacy)
 *   PUBLIC_API_IP_WINDOW_MS         (alias)
 *   GLOBAL_RATE_LIMIT_WINDOW_MS     (legacy)
 */
export function globalRateLimit(): RequestHandler {
  const max = parseInt(
    process.env.PUBLIC_API_IP_RATE_MAX || process.env.GLOBAL_RATE_LIMIT_MAX || "100",
    10,
  );
  const windowMs = parseInt(
    process.env.PUBLIC_API_IP_WINDOW_MS || process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || "60000",
    10,
  );

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getIp(req);
    
    // Check emergency block
    if (isEmergencyBlocked(ip)) {
      return sendApiError(
        res,
        apiError(
          429,
          ErrorCode.EMERGENCY_RATE_LIMIT_EXCEEDED,
          "IP temporarily blocked due to excessive requests. Contact support if this is an error.",
        ),
      );
    }
    
    const key = `global:${ip}`;
    const { allowed, retryAfterSeconds, remaining } = checkLimit(key, max, windowMs);

    // Add rate limit headers to all responses
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Window", String(windowMs / 1000));

    // Check for emergency threshold (>500 req/min)
    if (windowMs === 60000) {
      const emergencyKey = `emergency:${ip}`;
      const emergencyData = store.get(emergencyKey);
      const now = nowMs();
      const emergencyWindowStart = now - EMERGENCY_WINDOW_MS;
      
      if (!emergencyData || emergencyData.resetAt <= emergencyWindowStart) {
        store.set(emergencyKey, { count: 1, resetAt: now + EMERGENCY_WINDOW_MS });
      } else {
        emergencyData.count += 1;
        if (emergencyData.count > EMERGENCY_THRESHOLD) {
          addEmergencyBlock(ip);
          return sendApiError(
            res,
            apiError(
              429,
              ErrorCode.EMERGENCY_RATE_LIMIT_EXCEEDED,
              "IP temporarily blocked due to excessive requests. Contact support if this is an error.",
            ),
          );
        }
      }
    }

    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      
      // Log the rate limit event
      logRateLimitEvent({
        ipAddress: ip,
        endpoint: req.path,
        limitType: "global",
        retryAfterSeconds,
      });
      
      return sendApiError(
        res,
        apiError(429, ErrorCode.RATE_LIMIT_EXCEEDED, "Too many requests. Please slow down.", {
          retryAfterSeconds,
        }),
      );
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
    const { allowed, retryAfterSeconds, remaining } = checkLimit(key, max, windowMs);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Window", String(windowMs / 1000));

    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      
      logRateLimitEvent({
        ipAddress: getIp(req),
        endpoint: req.path,
        limitType: "merchant",
        retryAfterSeconds,
      });
      
      return sendApiError(
        res,
        apiError(
          429,
          ErrorCode.RATE_LIMIT_EXCEEDED,
          "Per-merchant rate limit exceeded. Please slow down.",
          { retryAfterSeconds },
        ),
      );
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
    const { allowed, retryAfterSeconds, remaining } = checkLimit(key, max, windowMs);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Window", String(windowMs / 1000));

    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      
      logRateLimitEvent({
        ipAddress: getIp(req),
        endpoint: req.path,
        limitType: "auth",
        retryAfterSeconds,
      });
      
      return sendApiError(
        res,
        apiError(
          429,
          ErrorCode.RATE_LIMIT_EXCEEDED,
          "Too many authentication attempts. Please try again later.",
          { retryAfterSeconds },
        ),
      );
    }

    next();
  };
}

/**
 * Per-merchant / per-API-key limit for routes that run *after* `authenticateApiKey`
 * or JWT that sets `merchantId` / `user.id`.
 *
 * Default: 200 requests per 60 seconds per merchant.
 *   MERCHANT_API_KEY_RATE_MAX
 *   MERCHANT_API_KEY_RATE_WINDOW_MS
 */
function getMerchantIdForApiKeyLimit(req: Request): string | null {
  const a = req as AuthRequest;
  if (a.merchantId) return a.merchantId;
  if (a.user?.id) return a.user.id;
  return null;
}

export function merchantApiKeyRateLimit(): RequestHandler {
  const max = parseInt(process.env.MERCHANT_API_KEY_RATE_MAX || "200", 10);
  const windowMs = parseInt(process.env.MERCHANT_API_KEY_RATE_WINDOW_MS || "60000", 10);

  return (req: Request, res: Response, next: NextFunction) => {
    const id = getMerchantIdForApiKeyLimit(req);
    if (!id) {
      return sendApiError(res, apiError(401, ErrorCode.AUTHENTICATION_REQUIRED, "Authentication required"));
    }
    const key = `mapikey:${id}`;
    const { allowed, retryAfterSeconds, remaining } = checkLimit(key, max, windowMs);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Window", String(windowMs / 1000));

    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      
      logRateLimitEvent({
        ipAddress: getIp(req),
        endpoint: req.path,
        limitType: "api_key",
        retryAfterSeconds,
      });
      
      return sendApiError(
        res,
        apiError(
          429,
          ErrorCode.RATE_LIMIT_EXCEEDED,
          "API rate limit for this key exceeded. Please slow down.",
          { retryAfterSeconds },
        ),
      );
    }

    next();
  };
}

/**
 * Middleware to check if CAPTCHA is required for the IP
 */
export function captchaCheck(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getIp(req);
    
    if (checkCaptchaRequired(ip)) {
      return sendApiError(
        res,
        apiError(
          403,
          ErrorCode.CAPTCHA_REQUIRED,
          "Too many failed payment attempts. Please complete the CAPTCHA to continue.",
        ),
      );
    }
    
    next();
  };
}
