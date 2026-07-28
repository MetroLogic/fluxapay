import { apiError } from "../helpers/apiError.helper";
import { getRedisClient } from "../sms/otpSmsRateLimiter";
import { ErrorCode } from "../types/errors";

const DEFAULT_MAX_PER_WINDOW = 3;
const DEFAULT_WINDOW_SECONDS = 10 * 60;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function config() {
  return {
    maxPerWindow: positiveInteger(process.env.OTP_EMAIL_MAX_PER_WINDOW, DEFAULT_MAX_PER_WINDOW),
    windowSeconds: positiveInteger(process.env.OTP_EMAIL_WINDOW_SECONDS, DEFAULT_WINDOW_SECONDS),
  };
}

function auditRateLimit(email: string, count: number, limit: number, retryAfterSeconds: number): void {
  const [localPart, domain] = email.split("@");
  const maskedEmail = domain ? `${localPart.slice(0, 1)}***@${domain}` : "invalid-email";

  console.warn(JSON.stringify({
    level: "warn",
    event: "otp_email_rate_limit",
    message: "OTP email rate limit exceeded",
    email: maskedEmail,
    count,
    limit,
    retry_after_seconds: retryAfterSeconds,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Limits OTP emails per normalized email address in a fixed Redis window.
 * The window suffix prevents a request after expiry from inheriting a stale counter.
 */
export async function assertOtpEmailRateLimit(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const { maxPerWindow, windowSeconds } = config();
  const window = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `otp_email:${normalizedEmail}:${window}`;
  const redis = getRedisClient();

  let count: number;
  let ttl: number;
  try {
    count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    } else {
      ttl = await redis.ttl(key);
      if (ttl < 0) {
        await redis.expire(key, windowSeconds);
        ttl = windowSeconds;
      }
    }
  } catch (error: any) {
    console.error(JSON.stringify({
      level: "error",
      event: "otp_email_rate_limiter_redis_error",
      message: "OTP email rate-limit check failed",
      error: error.message,
    }));
    return;
  }

  if (count > maxPerWindow) {
    // Repeated attempts after the second permitted request receive an
    // exponentially longer backoff. The current window TTL remains the
    // minimum wait, so the configured per-window limit is never bypassed.
    const exponentialBackoffSeconds = Math.ceil(windowSeconds / maxPerWindow)
      * (2 ** (count - maxPerWindow - 1));
    const retryAfterSeconds = Math.max(
      ttl > 0 ? ttl : windowSeconds,
      exponentialBackoffSeconds,
    );
    auditRateLimit(normalizedEmail, count, maxPerWindow, retryAfterSeconds);
    throw apiError(
      429,
      ErrorCode.OTP_EMAIL_RATE_LIMIT,
      "Too many OTP requests for this email address. Please try again later.",
      { retryAfterSeconds },
    );
  }
}
