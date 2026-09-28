import {
  getMaxSweepRetryAttempts,
  getSweepConfig,
  getSweepCronInterval,
  getSweepMinBalanceUsdc,
  logSweepConfigAtStartup,
} from "../sweep.config";

describe("sweep.config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SWEEP_CRON_INTERVAL;
    delete process.env.SWEEP_CRON;
    delete process.env.SWEEP_MIN_BALANCE_USDC;
    delete process.env.MAX_SWEEP_RETRY_ATTEMPTS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getSweepCronInterval", () => {
    it("defaults to hourly when no env vars are set", () => {
      expect(getSweepCronInterval()).toBe("0 * * * *");
    });

    it("prefers SWEEP_CRON_INTERVAL over SWEEP_CRON", () => {
      process.env.SWEEP_CRON_INTERVAL = "*/15 * * * *";
      process.env.SWEEP_CRON = "*/5 * * * *";
      expect(getSweepCronInterval()).toBe("*/15 * * * *");
    });

    it("falls back to SWEEP_CRON when SWEEP_CRON_INTERVAL is unset", () => {
      process.env.SWEEP_CRON = "*/10 * * * *";
      expect(getSweepCronInterval()).toBe("*/10 * * * *");
    });
  });

  describe("getSweepMinBalanceUsdc", () => {
    it("defaults to 0.5 when unset", () => {
      expect(getSweepMinBalanceUsdc()).toBe(0.5);
    });

    it("reads SWEEP_MIN_BALANCE_USDC from env", () => {
      process.env.SWEEP_MIN_BALANCE_USDC = "1.25";
      expect(getSweepMinBalanceUsdc()).toBe(1.25);
    });

    it("falls back to default for invalid values", () => {
      process.env.SWEEP_MIN_BALANCE_USDC = "not-a-number";
      expect(getSweepMinBalanceUsdc()).toBe(0.5);
    });
  });

  describe("getMaxSweepRetryAttempts", () => {
    it("defaults to 5 when unset", () => {
      expect(getMaxSweepRetryAttempts()).toBe(5);
    });

    it("reads MAX_SWEEP_RETRY_ATTEMPTS from env", () => {
      process.env.MAX_SWEEP_RETRY_ATTEMPTS = "3";
      expect(getMaxSweepRetryAttempts()).toBe(3);
    });

    it("falls back to default for invalid values", () => {
      process.env.MAX_SWEEP_RETRY_ATTEMPTS = "not-a-number";
      expect(getMaxSweepRetryAttempts()).toBe(5);
    });

    it("falls back to default for zero or negative values", () => {
      process.env.MAX_SWEEP_RETRY_ATTEMPTS = "0";
      expect(getMaxSweepRetryAttempts()).toBe(5);

      process.env.MAX_SWEEP_RETRY_ATTEMPTS = "-2";
      expect(getMaxSweepRetryAttempts()).toBe(5);
    });
  });

  describe("getSweepConfig", () => {
    it("returns interval, min balance, and max retry attempts together", () => {
      process.env.SWEEP_CRON_INTERVAL = "0 */2 * * *";
      process.env.SWEEP_MIN_BALANCE_USDC = "2";
      process.env.MAX_SWEEP_RETRY_ATTEMPTS = "7";
      expect(getSweepConfig()).toEqual({
        cronInterval: "0 */2 * * *",
        minBalanceUsdc: 2,
        maxSweepRetryAttempts: 7,
      });
    });
  });

  describe("logSweepConfigAtStartup", () => {
    it("logs sweep interval and min balance at startup", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      process.env.SWEEP_CRON_INTERVAL = "0 * * * *";
      process.env.SWEEP_MIN_BALANCE_USDC = "0.5";

      logSweepConfigAtStartup();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Sweep configuration loaded"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("0 * * * *"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("0.5"),
      );

      consoleSpy.mockRestore();
    });
  });
});
