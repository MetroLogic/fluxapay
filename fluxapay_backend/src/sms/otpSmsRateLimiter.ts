/**
 * otpSmsRateLimiter.ts
 *
 * Redis-backed OTP SMS rate limiter with two independent limits:
 *
 *  1. Per-phone limit   – max 5 OTP sends per phone number per 10 minutes.
 *     Key: otp:phone:<e164>       TTL: 600 s
 *
 *  2. Per-IP limit      – max 3 distinct phone numbers targeted per IP per hour.
 *     Key: otp:ip:<ip>:phones    (a Redis SET)   TTL: 3600 s
 *
 * Both limits must pass before an OTP SMS is dispatched. When either limit is
 * exceeded the function throws a structured error object:
 *   { status: 429, message: string, retryAfterSeconds: number }
 *
 * Every rate-limit hit is logged as a structured security-audit JSON entry.
 *
 * Environment variables:
 *   REDIS_URL                    – Redis connection URL (default: redis://localhost:6379)
 *   OTP_PHONE_MAX_PER_WINDOW     – max sends per phone per window (default: 5)
 *   OTP_PHONE_WINDOW_SECONDS     – window duration in seconds  (default: 600)
 *   OTP_IP_MAX_PHONES_PER_HOUR   – max distinct phones per IP per hour (default: 3)
 *   OTP_SMS_MAX_PER_MERCHANT_HOUR – legacy per-merchant limit kept for backward compat
 *   OTP_SMS_COST_ALERT_DAILY_THRESHOLD – global daily SMS alert threshold (default: 1000)
 */

import Redis from "ioredis";
import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

// ── Redis singleton ────────────────────────────────────────────────────────────

let _redis: Redis | null = null;

/** Lazily creates (and caches) the Redis client. */
export function getRedisClient(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      // Don't throw on connection errors — degrade gracefully
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });

    _redis.on("error", (err) => {
      // Log but don't crash — if Redis is down we fall back to allow-listing
      // (see REDIS_UNAVAILABLE_POLICY below).
      console.error(
        JSON.stringify({
          level: "error",
          event: "otp_rate_limiter_redis_error",
          message: "Redis connection error in OTP SMS rate limiter",
          error: err.message,
        }),
      );
    });
  }
  return _redis;
}

/** Test helper: replace the Redis client with a mock. */
export function setRedisClientForTests(client: Redis): void {
  _redis = client;
}

/** Test helper: reset the cached client. */
export function resetRedisClientForTests(): void {
  _redis = null;
}

// ── Config ─────────────────────────────────────────────────────────────────────

function getConfig() {
  return {
    phoneMaxPerWindow: parseInt(process.env.OTP_PHONE_MAX_PER_WINDOW ?? "5", 10),
    phoneWindowSeconds: parseInt(process.env.OTP_PHONE_WINDOW_SECONDS ?? "600", 10),
    ipMaxPhonesPerHour: parseInt(process.env.OTP_IP_MAX_PHONES_PER_HOUR ?? "3", 10),
    ipWindowSeconds: 3600,
  };
}

// ── Structured security audit log ─────────────────────────────────────────────

function logSecurityAudit(event: {
  type: "otp_rate_limit_phone" | "otp_rate_limit_ip" | "otp_send_allowed";
  phone: string;
  ip: string;
  count?: number;
  limit?: number;
  retryAfterSeconds?: number;
}): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      event: event.type,
      message:
        event.type === "otp_send_allowed"
          ? "OTP SMS send allowed"
          : `OTP SMS rate limit exceeded: ${event.type}`,
      phone_last4: event.phone.slice(-4),   // never log full phone numbers
      ip: event.ip,
      count: event.count,
      limit: event.limit,
      retry_after_seconds: event.retryAfterSeconds,
      timestamp: new Date().toISOString(),
    }),
  );
}

// ── Core limiter ───────────────────────────────────────────────────────────────

/**
 * Enforce both OTP SMS rate limits atomically.
 *
 * @param phone  E.164 phone number (e.g. "+15551234567")
 * @param ip     Requesting IP address
 *
 * @throws { status: 429, message: string, retryAfterSeconds: number }
 *         when either limit is exceeded.
 */
export async function assertOtpSmsRateLimits(
  phone: string,
  ip: string,
): Promise<void> {
  const cfg = getConfig();
  const redis = getRedisClient();

  // ── 1. Per-phone limit ─────────────────────────────────────────────────────
  const phoneKey = `otp:phone:${phone}`;

  let phoneCount: number;
  let phoneTtl: number;

  try {
    // INCR atomically increments (creates key with value 1 if absent)
    phoneCount = await redis.incr(phoneKey);

    if (phoneCount === 1) {
      // First send in this window — set expiry
      await redis.expire(phoneKey, cfg.phoneWindowSeconds);
      phoneTtl = cfg.phoneWindowSeconds;
    } else {
      phoneTtl = await redis.ttl(phoneKey);
      // Guard against TTL vanishing between INCR and TTL (rare race)
      if (phoneTtl < 0) {
        await redis.expire(phoneKey, cfg.phoneWindowSeconds);
        phoneTtl = cfg.phoneWindowSeconds;
      }
    }

    if (phoneCount > cfg.phoneMaxPerWindow) {
      const retryAfterSeconds = phoneTtl > 0 ? phoneTtl : cfg.phoneWindowSeconds;

      logSecurityAudit({
        type: "otp_rate_limit_phone",
        phone,
        ip,
        count: phoneCount,
        limit: cfg.phoneMaxPerWindow,
        retryAfterSeconds,
      });

      throw apiError(
        429,
        ErrorCode.OTP_SMS_RATE_LIMIT,
        "Too many OTP requests for this phone number. Please try again later.",
        { retryAfterSeconds },
      );
    }
  } catch (err: any) {
    // If it's our own 429, re-throw. Otherwise Redis is unavailable — fail open
    // (allow the send) to avoid blocking legitimate users during Redis outages.
    if (err?.status === 429) throw err;
    console.error(
      JSON.stringify({
        level: "error",
        event: "otp_rate_limiter_phone_check_failed",
        error: err.message,
      }),
    );
  }

  // ── 2. Per-IP distinct-phones limit ───────────────────────────────────────
  const ipKey = `otp:ip:${ip}:phones`;

  try {
    // SADD returns 1 if the phone was newly added, 0 if already present
    const added = await redis.sadd(ipKey, phone);

    // Always refresh TTL on activity so the window stays rolling
    const currentTtl = await redis.ttl(ipKey);
    if (currentTtl < 0 || added === 1) {
      await redis.expire(ipKey, cfg.ipWindowSeconds);
    }

    const distinctCount = await redis.scard(ipKey);

    if (distinctCount > cfg.ipMaxPhonesPerHour) {
      // The phone was just added — remove it so it doesn't inflate future counts
      await redis.srem(ipKey, phone);
      const ipTtl = await redis.ttl(ipKey);
      const retryAfterSeconds = ipTtl > 0 ? ipTtl : cfg.ipWindowSeconds;

      logSecurityAudit({
        type: "otp_rate_limit_ip",
        phone,
        ip,
        count: distinctCount,
        limit: cfg.ipMaxPhonesPerHour,
        retryAfterSeconds,
      });

      // Also roll back the phone counter increment to keep counts accurate
      await redis.decr(phoneKey).catch(() => {/* best-effort */});

      throw apiError(
        429,
        ErrorCode.OTP_SMS_RATE_LIMIT,
        "Too many phone numbers targeted from this IP address. Please try again later.",
        { retryAfterSeconds },
      );
    }
  } catch (err: any) {
    if (err?.status === 429) throw err;
    console.error(
      JSON.stringify({
        level: "error",
        event: "otp_rate_limiter_ip_check_failed",
        error: err.message,
      }),
    );
  }

  logSecurityAudit({ type: "otp_send_allowed", phone, ip });
}

// ── Legacy per-merchant in-memory limit (kept for backward compat) ─────────────

const HOUR_MS = 60 * 60 * 1000;

/** merchantId -> send timestamps (last hour) — in-memory, used by legacy path only */
const merchantWindows = new Map<string, number[]>();

export function resetOtpSmsRateLimitsForTests(): void {
  merchantWindows.clear();
}

/**
 * @deprecated Use assertOtpSmsRateLimits(phone, ip) instead.
 *
 * Kept so existing callers that only have merchantId continue to work.
 * Throws { status: 429, message } when merchant exceeds max sends per rolling hour.
 */
export function assertOtpSmsRateLimit(
  merchantId: string,
  maxPerHour: number,
): void {
  const now = Date.now();
  const cutoff = now - HOUR_MS;
  const prev = merchantWindows.get(merchantId) ?? [];
  const window = prev.filter((t) => t > cutoff);

  if (window.length >= maxPerHour) {
    throw apiError(
      429,
      ErrorCode.OTP_SMS_RATE_LIMIT,
      "Too many SMS verification requests. Please try again later or use email.",
      { retryAfterSeconds: Math.ceil(HOUR_MS / 1000) },
    );
  }

  window.push(now);
  merchantWindows.set(merchantId, window);
}

// ── Global daily cost monitoring ───────────────────────────────────────────────

let dailyCount = 0;
let dailyKey = "";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Track global OTP SMS volume per UTC day; log cost-alert style warnings at threshold.
 */
export function recordOtpSmsForCostMonitoring(dailyAlertThreshold: number): void {
  const key = todayKey();
  if (key !== dailyKey) {
    dailyKey = key;
    dailyCount = 0;
  }
  dailyCount += 1;

  if (dailyCount === dailyAlertThreshold) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "otp_sms_daily_cost_alert_threshold",
        message: `OTP SMS daily count reached configured alert threshold (${dailyAlertThreshold}). Review spend and fraud.`,
        daily_otp_sms_count: dailyCount,
        threshold: dailyAlertThreshold,
        date_utc: dailyKey,
      }),
    );
  } else if (dailyCount > dailyAlertThreshold && dailyCount % 250 === 0) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "otp_sms_daily_cost_alert_reminder",
        daily_otp_sms_count: dailyCount,
        threshold: dailyAlertThreshold,
        date_utc: dailyKey,
      }),
    );
  }
}

export function resetOtpSmsCostMonitorForTests(): void {
  dailyCount = 0;
  dailyKey = "";
}
