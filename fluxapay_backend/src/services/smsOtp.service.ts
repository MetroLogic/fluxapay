import { getSmsProvider } from "../sms/smsProvider.factory";
import {
  assertOtpSmsRateLimit,
  recordOtpSmsForCostMonitoring,
} from "../sms/otpSmsRateLimiter";

function otpSmsBody(otp: string): string {
  return `Your FluxaPay verification code is ${otp}. It expires in 10 minutes. Do not share this code.`;
}

/**
 * Send OTP via SMS with per-merchant hourly rate limit and global daily cost monitoring.
 */
export async function sendMerchantOtpSms(
  merchantId: string,
  phoneE164: string,
  otp: string,
): Promise<void> {
  const driver = (process.env.SMS_PROVIDER || "none").toLowerCase();
  if (driver === "none") {
    throw {
      status: 503,
      message:
        "SMS verification is not configured. Use email OTP or contact support.",
    };
  }

  const maxPerHour = parseInt(
    process.env.OTP_SMS_MAX_PER_MERCHANT_HOUR ?? "10",
    10,
  );
  const costThreshold = parseInt(
    process.env.OTP_SMS_COST_ALERT_DAILY_THRESHOLD ?? "1000",
    10,
  );

  assertOtpSmsRateLimit(
    merchantId,
    Number.isFinite(maxPerHour) && maxPerHour > 0 ? maxPerHour : 10,
  );

  const provider = getSmsProvider();
  await provider.sendSms(phoneE164.trim(), otpSmsBody(otp));

  recordOtpSmsForCostMonitoring(
    Number.isFinite(costThreshold) && costThreshold > 0 ? costThreshold : 1000,
  );
}
