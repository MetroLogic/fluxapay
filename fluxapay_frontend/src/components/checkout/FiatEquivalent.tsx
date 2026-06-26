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

  useEffect(() => {
    // Re-fetch whenever the currency changes
    setFiatValue(null);

    let cancelled = false;

    async function load() {
      const rateData = await api.fx.getRate(fiatCurrency);
      if (cancelled || !rateData) return;

      // rate = fiat units per 1 USDC
      const equivalent = usdcAmount * rateData.rate;

      // Choose decimal places: currencies like JPY/KRW have no sub-units
      const noDecimals = ['JPY', 'KRW', 'VND', 'CLP', 'ISK'];
      const fractionDigits = noDecimals.includes(fiatCurrency.toUpperCase()) ? 0 : 2;

      const formatted = equivalent.toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });

      setFiatValue(`≈ ${formatted} ${fiatCurrency.toUpperCase()}`);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [usdcAmount, fiatCurrency]);

  // Render nothing until we have a value — no skeleton, no error message
  if (!fiatValue) return null;

  return (
    <p
      className="mt-1 text-sm text-gray-400"
      aria-label={`Approximate fiat equivalent: ${fiatValue}`}
    >
      {fiatValue}
    </p>
  );
}
