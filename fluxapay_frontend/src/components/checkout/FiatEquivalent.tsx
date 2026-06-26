'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface FiatEquivalentProps {
  /** USDC amount to convert (e.g. 25.00) */
  usdcAmount: number;
  /**
   * Fiat currency code to display the equivalent in (e.g. "USD", "NGN").
   * Defaults to "USD" when not provided.
   */
  fiatCurrency?: string;
}

/**
 * Displays the approximate fiat equivalent of a USDC amount beneath the main
 * payment figure on checkout pages.
 *
 * - Fetches the live rate from GET /api/v1/fx-rates?currency=<fiatCurrency>
 * - Renders nothing while loading or when the rate is unavailable (never blocks checkout)
 * - Format: "≈ 25,000.00 NGN"
 */
export function FiatEquivalent({ usdcAmount, fiatCurrency = 'USD' }: FiatEquivalentProps) {
  const [fiatValue, setFiatValue] = useState<string | null>(null);
  const [resolvedKey, setResolvedKey] = useState('');
  const requestKey = `${usdcAmount}:${fiatCurrency}`;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const rateData = await api.fx.getRate(fiatCurrency);
      if (cancelled || !rateData) return;

      const equivalent = usdcAmount * rateData.rate;
      const noDecimals = ['JPY', 'KRW', 'VND', 'CLP', 'ISK'];
      const fractionDigits = noDecimals.includes(fiatCurrency.toUpperCase()) ? 0 : 2;

      const formatted = equivalent.toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });

      setFiatValue(`≈ ${formatted} ${fiatCurrency.toUpperCase()}`);
      setResolvedKey(requestKey);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [usdcAmount, fiatCurrency, requestKey]);

  if (resolvedKey !== requestKey || !fiatValue) return null;

  return (
    <p
      className="mt-1 text-sm text-gray-400"
      aria-label={`Approximate fiat equivalent: ${fiatValue}`}
    >
      {fiatValue}
    </p>
  );
}
