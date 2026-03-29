const HOUR_MS = 60 * 60 * 1000;

/** merchantId -> send timestamps (last hour) */
const merchantWindows = new Map<string, number[]>();

export function resetOtpSmsRateLimitsForTests(): void {
  merchantWindows.clear();
}

/**
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
    throw {
      status: 429,
      message:
        "Too many SMS verification requests. Please try again later or use email.",
    };
  }

  window.push(now);
  merchantWindows.set(merchantId, window);
}

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
