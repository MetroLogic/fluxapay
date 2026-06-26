import {
  assertOtpSmsRateLimit,
  recordOtpSmsForCostMonitoring,
  resetOtpSmsCostMonitorForTests,
  resetOtpSmsRateLimitsForTests,
} from "../otpSmsRateLimiter";

describe("otpSmsRateLimiter", () => {
  beforeEach(() => {
    resetOtpSmsRateLimitsForTests();
    resetOtpSmsCostMonitorForTests();
  });

  it("allows sends under the hourly merchant limit", () => {
    expect(() => assertOtpSmsRateLimit("merchant_1", 3)).not.toThrow();
    expect(() => assertOtpSmsRateLimit("merchant_1", 3)).not.toThrow();
    expect(() => assertOtpSmsRateLimit("merchant_1", 3)).not.toThrow();
  });

  it("throws 429 when merchant exceeds hourly limit", () => {
    assertOtpSmsRateLimit("merchant_2", 2);
    assertOtpSmsRateLimit("merchant_2", 2);

    expect(() => assertOtpSmsRateLimit("merchant_2", 2)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
  });

  it("tracks limits independently per merchant", () => {
    assertOtpSmsRateLimit("merchant_a", 1);
    expect(() => assertOtpSmsRateLimit("merchant_a", 1)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
    expect(() => assertOtpSmsRateLimit("merchant_b", 1)).not.toThrow();
  });

  it("emits cost alert when daily threshold is reached", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    recordOtpSmsForCostMonitoring(2);
    recordOtpSmsForCostMonitoring(2);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("otp_sms_daily_cost_alert_threshold"),
    );

    warn.mockRestore();
  });
});
