/**
 * Helpers for the checkout fiat-equivalent preview (issue #1255).
 *
 * The backend's `GET /api/v1/fx-rates?currency=XXX` returns `rate` as the
 * number of USDC one unit of fiat buys (it is what payment creation multiplies
 * a fiat amount by). The fiat equivalent of a USDC amount is therefore
 * `usdc / rate`.
 */

export const REFERENCE_CURRENCIES = ["USD", "NGN", "KES", "GHS"] as const;
export type ReferenceCurrency = (typeof REFERENCE_CURRENCIES)[number];

/** Region subtag → local reference currency. */
const REGION_CURRENCY: Record<string, ReferenceCurrency> = {
  NG: "NGN",
  KE: "KES",
  GH: "GHS",
  US: "USD",
};

export const FX_CACHE_PREFIX = "fluxapay:fx:";
/** Cached rates older than this are not shown at all. */
export const FX_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isReferenceCurrency(value: unknown): value is ReferenceCurrency {
  return typeof value === "string" && (REFERENCE_CURRENCIES as readonly string[]).includes(value);
}

/** Pick a sensible default currency from the browser's locale list. */
export function defaultReferenceCurrency(locales: readonly string[]): ReferenceCurrency {
  for (const locale of locales) {
    const region = locale.split(/[-_]/)[1]?.toUpperCase();
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  return "USD";
}

/** Fiat equivalent of `usdcAmount`, or `null` for an unusable rate. */
export function usdcToFiat(usdcAmount: number, usdcPerFiat: number): number | null {
  if (!Number.isFinite(usdcAmount) || !Number.isFinite(usdcPerFiat) || usdcPerFiat <= 0) {
    return null;
  }
  return usdcAmount / usdcPerFiat;
}

/**
 * Locale-aware currency formatting, e.g. `₦40,125.50` (en-NG) or
 * `KSh 3,240.00` (en-KE). Falls back to `40,125.50 NGN` if `Intl` rejects the
 * locale or currency.
 */
export function formatFiat(amount: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ${currency}`;
  }
}

export interface CachedRate {
  rate: number;
  /** Epoch ms when the rate was fetched. */
  fetchedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readCachedRate(
  storage: StorageLike | null | undefined,
  currency: string,
  now: number,
): CachedRate | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FX_CACHE_PREFIX + currency);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedRate>;
    if (typeof parsed.rate !== "number" || !(parsed.rate > 0) || typeof parsed.fetchedAt !== "number") {
      return null;
    }
    if (now - parsed.fetchedAt > FX_CACHE_MAX_AGE_MS) return null;
    return { rate: parsed.rate, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

export function writeCachedRate(
  storage: StorageLike | null | undefined,
  currency: string,
  value: CachedRate,
): void {
  if (!storage) return;
  try {
    storage.setItem(FX_CACHE_PREFIX + currency, JSON.stringify(value));
  } catch {
    // Storage full or disabled (private mode) — the preview still works live.
  }
}

/** "just now", "5 min ago", "3 h ago". */
export function describeAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}
