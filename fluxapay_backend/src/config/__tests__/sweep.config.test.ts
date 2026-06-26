import {
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

  describe("getSweepConfig", () => {
    it("returns interval and min balance together", () => {
      process.env.SWEEP_CRON_INTERVAL = "0 */2 * * *";
      process.env.SWEEP_MIN_BALANCE_USDC = "2";
      expect(getSweepConfig()).toEqual({
        cronInterval: "0 */2 * * *",
        minBalanceUsdc: 2,
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
