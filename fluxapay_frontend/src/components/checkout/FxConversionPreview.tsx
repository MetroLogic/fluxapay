'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  REFERENCE_CURRENCIES,
  type ReferenceCurrency,
  defaultReferenceCurrency,
  describeAge,
  formatFiat,
  isReferenceCurrency,
  readCachedRate,
  usdcToFiat,
  writeCachedRate,
} from '@/lib/fxPreview';

const PREFERENCE_KEY = 'fluxapay:fx:preferred-currency';

type RateState =
  | { kind: 'loading' }
  | { kind: 'live'; rate: number; stale: boolean }
  | { kind: 'cached'; rate: number; fetchedAt: number }
  | { kind: 'unavailable' };

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function browserLocales(): string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? [...navigator.languages] : [navigator.language];
}

interface FxConversionPreviewProps {
  /** Amount the customer must pay, in USDC. */
  usdcAmount: number;
  /** Override the initial reference currency (otherwise from locale / last choice). */
  initialCurrency?: ReferenceCurrency;
}

/**
 * Estimated local-currency equivalent shown under the USDC amount on
 * checkout (issue #1255).
 *
 * - The USDC figure stays the primary, required amount; this is subtext.
 * - The customer can switch the reference currency (USD, NGN, KES, GHS); the
 *   choice is remembered for next time.
 * - Every good rate is cached; if the live rate fails, is stale, or the
 *   device is offline, the last cached rate is shown with its age, and if
 *   there is none the preview says so instead of guessing.
 */
export function FxConversionPreview({ usdcAmount, initialCurrency }: FxConversionPreviewProps) {
  const [currency, setCurrency] = useState<ReferenceCurrency>(() => {
    if (initialCurrency) return initialCurrency;
    const saved = safeStorage()?.getItem(PREFERENCE_KEY);
    return isReferenceCurrency(saved) ? saved : defaultReferenceCurrency(browserLocales());
  });
  const [state, setState] = useState<RateState>({ kind: 'loading' });
  const locale = useMemo(() => browserLocales()[0], []);

  useEffect(() => {
    let cancelled = false;
    const storage = safeStorage();

    const fallBackToCache = () => {
      const cached = readCachedRate(storage, currency, Date.now());
      setState(cached ? { kind: 'cached', ...cached } : { kind: 'unavailable' });
    };

    setState({ kind: 'loading' });

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      fallBackToCache();
      return;
    }

    void api.fx
      .getRate(currency)
      .then((result) => {
        if (cancelled) return;
        if ('error' in result || !(result.data.rate > 0)) {
          fallBackToCache();
          return;
        }
        const rate = result.data.rate;
        const stale = (result.data as { stale?: unknown }).stale === true;
        if (!stale) writeCachedRate(storage, currency, { rate, fetchedAt: Date.now() });
        setState({ kind: 'live', rate, stale });
      })
      .catch(() => {
        if (!cancelled) fallBackToCache();
      });

    return () => {
      cancelled = true;
    };
  }, [currency]);

  const choose = (next: ReferenceCurrency) => {
    setCurrency(next);
    try {
      safeStorage()?.setItem(PREFERENCE_KEY, next);
    } catch {
      // ignore: preference persistence is best-effort
    }
  };

  const rate = state.kind === 'live' || state.kind === 'cached' ? state.rate : null;
  const fiat = rate != null ? usdcToFiat(usdcAmount, rate) : null;

  return (
    <div className="mt-2 flex flex-col items-center gap-2" data-testid="fx-preview">
      <p className="min-h-5 text-sm text-gray-500" aria-live="polite">
        {state.kind === 'loading' && <span className="text-gray-400">Fetching exchange rate…</span>}
        {fiat != null && (
          <span aria-label={`Approximately ${formatFiat(fiat, currency, locale)}`}>
            ≈ <span className="font-medium text-gray-700">{formatFiat(fiat, currency, locale)}</span>
          </span>
        )}
        {state.kind === 'unavailable' && (
          <span>Live {currency} rate unavailable. Pay the USDC amount shown above.</span>
        )}
      </p>

      {(state.kind === 'cached' || (state.kind === 'live' && state.stale)) && (
        <p className="text-xs text-amber-700" role="status">
          {state.kind === 'cached'
            ? `Using the last known rate from ${describeAge(Date.now() - state.fetchedAt)}; live rates are unavailable.`
            : 'This rate may be out of date.'}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-1" role="group" aria-label="Reference currency">
        {REFERENCE_CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => choose(code)}
            aria-pressed={code === currency}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
              code === currency
                ? 'border-transparent bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {code}
          </button>
        ))}
      </div>

      <p className="max-w-xs text-center text-[11px] leading-snug text-gray-400">
        Estimate for reference only. Final settlement exchange rates may vary slightly depending on
        settlement time.
      </p>
    </div>
  );
}
