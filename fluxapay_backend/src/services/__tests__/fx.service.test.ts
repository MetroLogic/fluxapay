/**
 * fx.service.test.ts
 *
 * Unit tests for the FX circuit breaker (#823): closed / open / half-open
 * state transitions, stale-rate serving bounded by FX_STALE_RATE_MAX_AGE_SECONDS,
 * hardcoded fallback rates, and the structured FX_SERVICE_UNAVAILABLE error.
 */

jest.mock("../settlementAlert.service", () => ({
  sendOpsAlert: jest.fn().mockResolvedValue(undefined),
}));

import { sendOpsAlert } from "../settlementAlert.service";
import {
  FxService,
  getFxCircuitBreakerStatus,
  resetFxCircuitBreakerForTests,
} from "../fx.service";

/** rates maps currency -> desired post-inversion USDC rate. */
function mockFetchOk(rates: Record<string, number>) {
  const rawRates: Record<string, number> = {};
  for (const [currency, usdcRate] of Object.entries(rates)) {
    rawRates[currency] = 1 / usdcRate;
  }
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ base: "USD", rates: rawRates }),
  });
}

function mockFetchFail() {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 503,
    statusText: "Service Unavailable",
  });
}

describe("FxService circuit breaker", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetFxCircuitBreakerForTests();
    process.env = {
      ...originalEnv,
      FX_CIRCUIT_FAILURE_THRESHOLD: "3",
      FX_CIRCUIT_RESET_TIMEOUT_MS: "1000",
      FX_STALE_RATE_MAX_AGE_SECONDS: "3600",
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetFxCircuitBreakerForTests();
    jest.useRealTimers();
  });

  it("USDC/USD is always 1:1 and never touches the network", async () => {
    const result = await FxService.getUSDCExchangeRateWithMeta("usd");
    expect(result).toEqual({ rate: 1.0, stale: false, circuitState: "closed" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("getUSDCExchangeRate (legacy wrapper) still returns a plain number", async () => {
    mockFetchFail();
    const rate = await FxService.getUSDCExchangeRate("NGN");
    expect(typeof rate).toBe("number");
  });

  describe("closed state", () => {
    it("fetches a live rate and reports it as non-stale", async () => {
      mockFetchOk({ NGN: 1550 });

      const result = await FxService.getUSDCExchangeRateWithMeta("NGN");

      expect(result.stale).toBe(false);
      expect(result.circuitState).toBe("closed");
      expect(result.rate).toBeCloseTo(1550, 5);
    });

    it("stays closed and serves the hardcoded fallback below the failure threshold", async () => {
      mockFetchFail();

      const result = await FxService.getUSDCExchangeRateWithMeta("NGN");

      expect(result.stale).toBe(true);
      expect(result.rate).toBe(0.00065); // hardcoded FALLBACK_RATES.NGN
      expect(getFxCircuitBreakerStatus()).toMatchObject({
        state: "closed",
        consecutiveFailures: 1,
      });
      expect(sendOpsAlert).not.toHaveBeenCalled();
    });

    it("throws a structured FX_SERVICE_UNAVAILABLE error when there is no cache or fallback", async () => {
      mockFetchFail();

      await expect(
        FxService.getUSDCExchangeRateWithMeta("XYZ"),
      ).rejects.toMatchObject({
        status: 503,
        code: "FX_SERVICE_UNAVAILABLE",
      });
    });
  });

  describe("open state", () => {
    it("opens after 3 consecutive failures and alerts ops", async () => {
      mockFetchFail();

      await FxService.getUSDCExchangeRateWithMeta("NGN");
      await FxService.getUSDCExchangeRateWithMeta("NGN");
      await FxService.getUSDCExchangeRateWithMeta("NGN");

      expect(getFxCircuitBreakerStatus()).toMatchObject({
        state: "open",
        consecutiveFailures: 3,
      });
      expect(sendOpsAlert).toHaveBeenCalledWith(
        "FxCircuitBreaker",
        expect.stringContaining("FX circuit breaker OPEN"),
      );
    });

    it("skips the live fetch entirely once open", async () => {
      mockFetchFail();
      await FxService.getUSDCExchangeRateWithMeta("NGN");
      await FxService.getUSDCExchangeRateWithMeta("NGN");
      await FxService.getUSDCExchangeRateWithMeta("NGN");
      expect(getFxCircuitBreakerStatus().state).toBe("open");

      (global.fetch as jest.Mock).mockClear();
      const result = await FxService.getUSDCExchangeRateWithMeta("NGN");

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.stale).toBe(true);
    });
  });

  describe("half-open state", () => {
    async function openTheCircuit() {
      mockFetchFail();
      await FxService.getUSDCExchangeRateWithMeta("NGN");
      await FxService.getUSDCExchangeRateWithMeta("NGN");
      await FxService.getUSDCExchangeRateWithMeta("NGN");
      expect(getFxCircuitBreakerStatus().state).toBe("open");
    }

    it("allows a trial request after the reset timeout and closes on success", async () => {
      await openTheCircuit();

      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(Date.now() + 1500); // past the 1000ms reset timeout

      mockFetchOk({ NGN: 1600 });
      const result = await FxService.getUSDCExchangeRateWithMeta("NGN");

      expect(result.stale).toBe(false);
      expect(getFxCircuitBreakerStatus()).toMatchObject({
        state: "closed",
        consecutiveFailures: 0,
      });
    });

    it("re-opens if the half-open trial request also fails", async () => {
      await openTheCircuit();

      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(Date.now() + 1500);

      mockFetchFail();
      const result = await FxService.getUSDCExchangeRateWithMeta("NGN");

      expect(result.stale).toBe(true);
      expect(getFxCircuitBreakerStatus().state).toBe("open");
      // Re-opening from half-open doesn't require the threshold to be hit again.
      expect(sendOpsAlert).toHaveBeenCalledTimes(2);
    });
  });

  describe("stale rate max age", () => {
    beforeEach(() => {
      process.env.FX_CACHE_TTL_MS = "1000"; // fresh for 1s
      process.env.FX_STALE_RATE_MAX_AGE_SECONDS = "5"; // stale usable for 5s after that
    });

    it("serves the stale cached rate within the max-age window", async () => {
      mockFetchOk({ NGN: 1500 });
      await FxService.getUSDCExchangeRateWithMeta("NGN"); // caches a fresh rate

      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(Date.now() + 2000); // cache stale (>1s) but within the 5s window

      mockFetchFail();
      const result = await FxService.getUSDCExchangeRateWithMeta("NGN");

      expect(result.stale).toBe(true);
      expect(result.rate).toBeCloseTo(1500, 5);
    });

    it("ignores the cached rate once it exceeds FX_STALE_RATE_MAX_AGE_SECONDS", async () => {
      mockFetchOk({ NGN: 1500 });
      await FxService.getUSDCExchangeRateWithMeta("NGN");

      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(Date.now() + 10_000); // well past the 5s stale ceiling

      mockFetchFail();
      const result = await FxService.getUSDCExchangeRateWithMeta("NGN");

      // The too-old cached rate (1500) is ignored; falls through to the
      // hardcoded fallback (0.00065) instead, still marked stale.
      expect(result.rate).toBe(0.00065);
      expect(result.stale).toBe(true);
    });
  });
});
