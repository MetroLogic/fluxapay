import { getSmsProvider } from "../sms/smsProvider.factory";
import {
  assertOtpSmsRateLimits,
  assertOtpSmsRateLimit,
  recordOtpSmsForCostMonitoring,
} from "../sms/otpSmsRateLimiter";

function otpSmsBody(otp: string): string {
  return `Your FluxaPay verification code is ${otp}. It expires in 10 minutes. Do not share this code.`;
}

/**
 * Send OTP via SMS.
 *
 * Enforces two independent Redis-backed rate limits before dispatching:
 *   1. Per-phone:  max 5 sends per phone number per 10 minutes
 *   2. Per-IP:     max 3 distinct phone numbers targeted per IP per hour
 *
 * Falls back to the legacy per-merchant in-memory limit when no IP is provided
 * (e.g. internal/test callers that have not been updated yet).
 *
 * @param merchantId  Merchant identifier (used for legacy fallback limit)
 * @param phoneE164   Destination phone in E.164 format (e.g. +15551234567)
 * @param otp         Plain-text OTP to embed in the SMS
 * @param ip          Requesting IP address (required for IP-based limit)
 */
export async function sendMerchantOtpSms(
  merchantId: string,
  phoneE164: string,
  otp: string,
  ip?: string,
): Promise<void> {
  const driver = (process.env.SMS_PROVIDER || "none").toLowerCase();
  if (driver === "none") {
    throw {
      status: 503,
      message:
        "SMS verification is not configured. Use email OTP or contact support.",
    };
  }

  if (ip) {
    // Primary path: Redis-backed per-phone + per-IP limits
    await assertOtpSmsRateLimits(phoneE164.trim(), ip);
  } else {
    // Legacy fallback: in-memory per-merchant limit
    const maxPerHour = parseInt(
      process.env.OTP_SMS_MAX_PER_MERCHANT_HOUR ?? "10",
      10,
    );
    assertOtpSmsRateLimit(
      merchantId,
      Number.isFinite(maxPerHour) && maxPerHour > 0 ? maxPerHour : 10,
    );
  }

  const provider = getSmsProvider();
  await provider.sendSms(phoneE164.trim(), otpSmsBody(otp));

  const costThreshold = parseInt(
    process.env.OTP_SMS_COST_ALERT_DAILY_THRESHOLD ?? "1000",
    10,
  );
  recordOtpSmsForCostMonitoring(
    Number.isFinite(costThreshold) && costThreshold > 0 ? costThreshold : 1000,
  );
}
