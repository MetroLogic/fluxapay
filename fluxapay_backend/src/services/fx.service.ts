import { getLogger } from "../utils/logger";
import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { sendOpsAlert } from "./settlementAlert.service";

const logger = getLogger("FxService");

const FX_API_URL = process.env.FX_API_URL || "https://api.frankfurter.dev/v1/latest";

/** How long a live-fetched rate is considered fresh before a refetch is attempted. */
function getCacheTtlMs(): number {
  const raw = parseInt(process.env.FX_CACHE_TTL_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 3600000; // 1 hour default
}

// Hardcoded fallback rates used when the live API is unreachable.
// USDC is pegged 1:1 to USD, so these represent 1 unit of fiat = X USDC.
const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.25,
  NGN: 0.00065,
};

interface RateCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

let cachedRates: RateCache | null = null;

// ─── Circuit breaker ─────────────────────────────────────────────────────────
//
// closed      – normal operation, live fetches are attempted.
// open        – live fetches are skipped entirely (fail fast) until the reset
//               timeout elapses, serving stale/fallback rates instead.
// half_open   – reset timeout elapsed; the next call is allowed through as a
//               trial. Success closes the circuit, failure re-opens it.

export type CircuitState = "closed" | "open" | "half_open";

interface CircuitBreakerState {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  lastError: string | null;
}

let circuit: CircuitBreakerState = {
  state: "closed",
  consecutiveFailures: 0,
  openedAt: null,
  lastError: null,
};

function getCircuitFailureThreshold(): number {
  const raw = parseInt(process.env.FX_CIRCUIT_FAILURE_THRESHOLD ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

function getCircuitResetTimeoutMs(): number {
  const raw = parseInt(process.env.FX_CIRCUIT_RESET_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 30000;
}

/** Max age of a cached rate that may still be served as a stale fallback. */
function getStaleRateMaxAgeMs(): number {
  const raw = parseInt(process.env.FX_STALE_RATE_MAX_AGE_SECONDS ?? "", 10);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 3600;
  return seconds * 1000;
}

export interface FxCircuitBreakerStatus {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: string | null;
  lastError: string | null;
}

/** Snapshot of the circuit breaker's current state, for /health and diagnostics. */
export function getFxCircuitBreakerStatus(): FxCircuitBreakerStatus {
  return {
    state: circuit.state,
    consecutiveFailures: circuit.consecutiveFailures,
    openedAt: circuit.openedAt ? new Date(circuit.openedAt).toISOString() : null,
    lastError: circuit.lastError,
  };
}

/** Test-only escape hatch to reset both the circuit breaker and the rate cache. */
export function resetFxCircuitBreakerForTests(): void {
  circuit = { state: "closed", consecutiveFailures: 0, openedAt: null, lastError: null };
  cachedRates = null;
}

function alertOpsCircuitOpen(reason: string): void {
  sendOpsAlert(
    "FxCircuitBreaker",
    `FX circuit breaker OPEN — exchange partner appears unreachable.\nReason: ${reason}`,
  ).catch((err) => {
    logger.error("Failed to send FX circuit breaker alert", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

function recordSuccess(): void {
  const wasOpenOrDegraded = circuit.state !== "closed" || circuit.consecutiveFailures > 0;
  if (wasOpenOrDegraded) {
    logger.info("FX circuit breaker closed after successful fetch", {
      previousState: circuit.state,
    });
  }
  circuit = { state: "closed", consecutiveFailures: 0, openedAt: null, lastError: null };
}

function recordFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  circuit.lastError = message;

  if (circuit.state === "half_open") {
    // The trial request failed — re-open and restart the cooldown.
    circuit.state = "open";
    circuit.openedAt = Date.now();
    logger.error("FX circuit breaker re-opened after failed trial request", {
      error: message,
    });
    alertOpsCircuitOpen(message);
    return;
  }

  circuit.consecutiveFailures += 1;
  const threshold = getCircuitFailureThreshold();

  if (circuit.state === "closed" && circuit.consecutiveFailures >= threshold) {
    circuit.state = "open";
    circuit.openedAt = Date.now();
    logger.error("FX circuit breaker opened after consecutive failures", {
      consecutiveFailures: circuit.consecutiveFailures,
      threshold,
      error: message,
    });
    alertOpsCircuitOpen(message);
  }
}

/** Should we attempt a live fetch right now, given the circuit state? */
function shouldAttemptLiveFetch(): boolean {
  if (circuit.state !== "open") return true;

  const resetTimeoutMs = getCircuitResetTimeoutMs();
  const elapsed = Date.now() - (circuit.openedAt ?? Date.now());
  if (elapsed >= resetTimeoutMs) {
    circuit.state = "half_open";
    logger.info("FX circuit breaker half-open — allowing a trial request", { elapsed });
    return true;
  }
  return false;
}

async function fetchLiveRates(): Promise<Record<string, number>> {
  const res = await fetch(FX_API_URL);
  if (!res.ok) {
    throw new Error(`FX API responded with ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as {
    base: string;
    rates: Record<string, number>;
  };

  // Frankfurter returns foreign-currency-per-USD. We need the inverse
  // so that the result means "1 unit of fiat = X USDC".
  const inverted: Record<string, number> = {};
  for (const [currency, foreignPerUsd] of Object.entries(data.rates)) {
    if (foreignPerUsd > 0) {
      inverted[currency] = 1 / foreignPerUsd;
    }
  }
  // USD is always 1:1 with USDC
  inverted["USD"] = 1.0;

  return inverted;
}

export interface FxRateResult {
  /** Exchange rate (1 unit of fiat = X USDC). */
  rate: number;
  /** True when this rate came from a stale cache or hardcoded fallback rather than a fresh fetch. */
  stale: boolean;
  circuitState: CircuitState;
}

export class FxService {
  /**
   * Fetches the current exchange rate from Fiat to USDC.
   *
   * Tries the live Frankfurter (ECB) API first (unless the circuit breaker is
   * open). If that fails, falls back to a stale in-memory cache (up to
   * FX_STALE_RATE_MAX_AGE_SECONDS old), and finally to hardcoded constants.
   *
   * @param fiatCurrency 3-letter currency code (e.g. NGN, EUR, GBP)
   * @returns Exchange rate (1 unit of fiat = X USDC)
   * @throws Error if the currency is unknown and no rate can be determined
   */
  static async getUSDCExchangeRate(fiatCurrency: string): Promise<number> {
    const result = await FxService.getUSDCExchangeRateWithMeta(fiatCurrency);
    return result.rate;
  }

  /**
   * Same as getUSDCExchangeRate, but also reports whether the returned rate
   * is stale (served from cache/fallback rather than a fresh live fetch) and
   * the current circuit breaker state — used by createPayment to surface
   * fx_rate_stale on the created payment.
   */
  static async getUSDCExchangeRateWithMeta(fiatCurrency: string): Promise<FxRateResult> {
    const currency = fiatCurrency.toUpperCase();

    // USDC (and USD) are pegged 1:1 — no conversion needed
    if (currency === "USDC" || currency === "USD") {
      return { rate: 1.0, stale: false, circuitState: circuit.state };
    }

    const now = Date.now();

    // 1. Fresh in-memory cache is always usable, regardless of circuit state.
    if (cachedRates && now - cachedRates.fetchedAt < getCacheTtlMs()) {
      if (cachedRates.rates[currency] !== undefined) {
        return { rate: cachedRates.rates[currency], stale: false, circuitState: circuit.state };
      }
    } else if (shouldAttemptLiveFetch()) {
      try {
        const liveRates = await fetchLiveRates();
        cachedRates = { rates: liveRates, fetchedAt: now };
        recordSuccess();
        logger.info("FX rates refreshed from live API", {
          count: Object.keys(liveRates).length,
        });

        if (liveRates[currency] !== undefined) {
          return { rate: liveRates[currency], stale: false, circuitState: circuit.state };
        }
      } catch (err) {
        recordFailure(err);
        logger.warn("Failed to fetch live FX rates, falling back", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      logger.warn("FX circuit breaker open — skipping live fetch", {
        consecutiveFailures: circuit.consecutiveFailures,
      });
    }

    // 2. Stale cache is usable up to FX_STALE_RATE_MAX_AGE_SECONDS.
    if (cachedRates && cachedRates.rates[currency] !== undefined) {
      const age = now - cachedRates.fetchedAt;
      const maxAgeMs = getStaleRateMaxAgeMs();
      if (age <= maxAgeMs) {
        logger.warn("Using stale cached FX rate", { currency, age });
        return { rate: cachedRates.rates[currency], stale: true, circuitState: circuit.state };
      }
      logger.warn("Cached FX rate exceeded max staleness window, ignoring", {
        currency,
        age,
        maxAgeMs,
      });
    }

    // 3. Hardcoded fallback rate.
    if (FALLBACK_RATES[currency] !== undefined) {
      logger.warn("Using hardcoded fallback FX rate", { currency });
      return { rate: FALLBACK_RATES[currency], stale: true, circuitState: circuit.state };
    }

    // 4. Nothing usable — fail loud with a clear, structured error.
    throw apiError(
      503,
      ErrorCode.FX_SERVICE_UNAVAILABLE,
      `FX rate for "${currency}" is unavailable: the exchange partner is unreachable and no cached or fallback rate exists.`,
    );
  }
}
