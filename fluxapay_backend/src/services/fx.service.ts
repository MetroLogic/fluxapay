import { getLogger } from "../utils/logger";

const logger = getLogger("FxService");

const CACHE_TTL_MS = parseInt(process.env.FX_CACHE_TTL_MS || "3600000", 10); // 1 hour default
const FX_API_URL = process.env.FX_API_URL || "https://api.frankfurter.dev/v1/latest";

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

export class FxService {
  /**
   * Fetches the current exchange rate from Fiat to USDC.
   *
   * Tries the live Frankfurter (ECB) API first. If that fails, falls back
   * to a stale in-memory cache, and finally to hardcoded constants.
   *
   * @param fiatCurrency 3-letter currency code (e.g. NGN, EUR, GBP)
   * @returns Exchange rate (1 unit of fiat = X USDC)
   * @throws Error if the currency is unknown and no rate can be determined
   */
  static async getUSDCExchangeRate(fiatCurrency: string): Promise<number> {
    const currency = fiatCurrency.toUpperCase();

    // USDC (and USD) are pegged 1:1 — no conversion needed
    if (currency === "USDC" || currency === "USD") {
      return 1.0;
    }

    // 1. Try live fetch (skip if cache is still fresh)
    const now = Date.now();
    if (cachedRates && now - cachedRates.fetchedAt < CACHE_TTL_MS) {
      if (cachedRates.rates[currency] !== undefined) {
        return cachedRates.rates[currency];
      }
    } else {
      try {
        const liveRates = await fetchLiveRates();
        cachedRates = { rates: liveRates, fetchedAt: now };
        logger.info("FX rates refreshed from live API", {
          count: Object.keys(liveRates).length,
        });

        if (liveRates[currency] !== undefined) {
          return liveRates[currency];
        }
      } catch (err) {
        logger.warn("Failed to fetch live FX rates, falling back", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Stale cache is still usable
    if (cachedRates && cachedRates.rates[currency] !== undefined) {
      logger.warn("Using stale cached FX rate", {
        currency,
        age: now - cachedRates.fetchedAt,
      });
      return cachedRates.rates[currency];
    }

    // 3. Hardcoded fallback
    if (FALLBACK_RATES[currency] !== undefined) {
      logger.warn("Using hardcoded fallback FX rate", { currency });
      return FALLBACK_RATES[currency];
    }

    // 4. Unknown currency — fail loud instead of silently assuming 1:1
    throw new Error(
      `Unsupported currency "${currency}". No live, cached, or fallback rate is available.`,
    );
  }
}
