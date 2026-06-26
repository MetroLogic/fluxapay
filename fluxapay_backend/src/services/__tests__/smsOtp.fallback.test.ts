/**
 * Unit tests for SMS OTP provider failover behaviour.
 */
import {
  resetOtpSmsCostMonitorForTests,
  resetOtpSmsRateLimitsForTests,
} from "../../sms/otpSmsRateLimiter";
import type { SmsProvider } from "../../sms/smsProvider.interface";
import {
  resetSmsProviderCacheForTests,
  setSmsProvidersForTests,
} from "../../sms/smsProvider.factory";
import { sendMerchantOtpSms } from "../smsOtp.service";

describe("SMS OTP failover", () => {
  const saved = { ...process.env };
  const outbox: Array<{ to: string; body: string }> = [];

  const successProvider: SmsProvider = {
    async sendSms(toE164: string, body: string) {
      outbox.push({ to: toE164, body });
    },
  };

  const failingProvider = (message: string): SmsProvider => ({
    async sendSms() {
      throw new Error(message);
    },
  });

  beforeEach(() => {
    process.env = {
      ...saved,
      SMS_PROVIDER: "mock",
      SMS_FALLBACK_PROVIDER: "mock",
      OTP_SMS_MAX_PER_MERCHANT_HOUR: "10",
      OTP_SMS_COST_ALERT_DAILY_THRESHOLD: "1000",
    };
    outbox.length = 0;
    resetSmsProviderCacheForTests();
    resetOtpSmsRateLimitsForTests();
    resetOtpSmsCostMonitorForTests();
  });

  afterAll(() => {
    process.env = saved;
    resetSmsProviderCacheForTests();
  });

  it("delivers via primary when primary succeeds", async () => {
    setSmsProvidersForTests(successProvider, {
      fallback: failingProvider("fallback should not run"),
      primaryDriver: "mock",
      fallbackDriver: "messagebird",
    });

    await sendMerchantOtpSms("merchant_primary_ok", "+12025550123", "111111");

    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("+12025550123");
    expect(outbox[0].body).toContain("111111");
  });

  it("retries via fallback when primary fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    setSmsProvidersForTests(failingProvider("Twilio SMS failed (503)"), {
      fallback: successProvider,
      primaryDriver: "twilio",
      fallbackDriver: "messagebird",
    });

    await sendMerchantOtpSms("merchant_fallback_ok", "+12025550456", "222222");

    expect(outbox).toHaveLength(1);
    expect(outbox[0].body).toContain("222222");

    const joined = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(joined).toContain("sms_provider_fallback");
    expect(joined).toContain("Twilio SMS failed (503)");
    warn.mockRestore();
  });

  it("returns sms_delivery_failed when both providers fail", async () => {
    setSmsProvidersForTests(failingProvider("primary outage"), {
      fallback: failingProvider("fallback outage"),
      primaryDriver: "twilio",
      fallbackDriver: "messagebird",
    });

    await expect(
      sendMerchantOtpSms("merchant_both_fail", "+12025550789", "333333"),
    ).rejects.toMatchObject({
      status: 502,
      message: "sms_delivery_failed",
      primaryError: "primary outage",
      fallbackError: "fallback outage",
    });

    expect(outbox).toHaveLength(0);
  });
});
