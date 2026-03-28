/**
 * End-to-end style tests for SMS OTP: mock provider, rate limits, cost alerts.
 * No real Twilio/MessageBird calls.
 */
import {
  getMockSmsOutbox,
  resetMockSmsOutbox,
} from "../../sms/mockSms.provider";
import {
  resetOtpSmsCostMonitorForTests,
  resetOtpSmsRateLimitsForTests,
} from "../../sms/otpSmsRateLimiter";
import { resetSmsProviderCacheForTests } from "../../sms/smsProvider.factory";
import { sendMerchantOtpSms } from "../smsOtp.service";

describe("SMS OTP service (mock provider)", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...saved,
      SMS_PROVIDER: "mock",
      OTP_SMS_MAX_PER_MERCHANT_HOUR: "10",
      OTP_SMS_COST_ALERT_DAILY_THRESHOLD: "1000",
    };
    resetSmsProviderCacheForTests();
    resetMockSmsOutbox();
    resetOtpSmsRateLimitsForTests();
    resetOtpSmsCostMonitorForTests();
  });

  afterAll(() => {
    process.env = saved;
    resetSmsProviderCacheForTests();
  });

  it("delivers OTP body via mock SMS provider", async () => {
    await sendMerchantOtpSms("merchant_a", "+12025550123", "654321");
    const out = getMockSmsOutbox();
    expect(out).toHaveLength(1);
    expect(out[0].to).toBe("+12025550123");
    expect(out[0].body).toContain("654321");
    expect(out[0].body).toMatch(/FluxaPay/i);
  });

  it("returns 429 after hourly SMS OTP limit for same merchant", async () => {
    process.env.OTP_SMS_MAX_PER_MERCHANT_HOUR = "2";
    await sendMerchantOtpSms("merchant_b", "+12025550999", "111111");
    await sendMerchantOtpSms("merchant_b", "+12025550999", "222222");
    await expect(
      sendMerchantOtpSms("merchant_b", "+12025550999", "333333"),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("returns 503 when SMS_PROVIDER is none", async () => {
    process.env.SMS_PROVIDER = "none";
    resetSmsProviderCacheForTests();
    await expect(
      sendMerchantOtpSms("merchant_c", "+12025550888", "000000"),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 503,
      }),
    );
    expect(getMockSmsOutbox()).toHaveLength(0);
  });

  it("emits structured cost alert when daily SMS count hits threshold", async () => {
    process.env.OTP_SMS_COST_ALERT_DAILY_THRESHOLD = "3";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    for (let i = 0; i < 3; i++) {
      await sendMerchantOtpSms(
        `merchant_cost_${i}`,
        `+1202555${String(1000 + i).slice(-4)}`,
        "999999",
      );
    }

    const joined = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("otp_sms_daily_cost_alert_threshold");
    warn.mockRestore();
  });
});
