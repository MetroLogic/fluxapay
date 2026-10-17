import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const getRate = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { fx: { getRate: (...a: unknown[]) => getRate(...a) } },
}));

import { FxConversionPreview } from '../FxConversionPreview';
import {
  FX_CACHE_MAX_AGE_MS,
  FX_CACHE_PREFIX,
  defaultReferenceCurrency,
  describeAge,
  formatFiat,
  readCachedRate,
  usdcToFiat,
  writeCachedRate,
} from '@/lib/fxPreview';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('fxPreview helpers', () => {
  it('converts USDC to fiat using a USDC-per-fiat rate', () => {
    // 1 NGN buys 0.000625 USDC  →  25 USDC ≈ 40,000 NGN
    expect(usdcToFiat(25, 0.000625)).toBeCloseTo(40_000, 6);
    expect(usdcToFiat(25, 1)).toBe(25);
    expect(usdcToFiat(25, 0)).toBeNull();
    expect(usdcToFiat(25, Number.NaN)).toBeNull();
  });

  it('formats amounts for the locale, with grouping and 2 decimals', () => {
    expect(formatFiat(40125.5, 'USD', 'en-US')).toBe('$40,125.50');
    expect(formatFiat(40125.5, 'NGN', 'en-NG')).toMatch(/40,125\.50/);
    // Unknown currency codes fall back to a plain grouped number.
    expect(formatFiat(1234.5, 'NOT-A-CODE', 'en-US')).toBe('1,234.50 NOT-A-CODE');
  });

  it('picks the reference currency from the browser locale', () => {
    expect(defaultReferenceCurrency(['en-NG'])).toBe('NGN');
    expect(defaultReferenceCurrency(['sw_KE', 'en'])).toBe('KES');
    expect(defaultReferenceCurrency(['fr', 'en-GH'])).toBe('GHS');
    expect(defaultReferenceCurrency(['de-DE'])).toBe('USD');
    expect(defaultReferenceCurrency([])).toBe('USD');
  });

  it('caches rates and expires old entries', () => {
    const storage = memoryStorage();
    writeCachedRate(storage, 'KES', { rate: 0.0077, fetchedAt: 1_000 });
    expect(readCachedRate(storage, 'KES', 2_000)).toEqual({ rate: 0.0077, fetchedAt: 1_000 });
    expect(readCachedRate(storage, 'KES', 1_000 + FX_CACHE_MAX_AGE_MS + 1)).toBeNull();
    storage.setItem(`${FX_CACHE_PREFIX}GHS`, 'garbage');
    expect(readCachedRate(storage, 'GHS', 2_000)).toBeNull();
    expect(readCachedRate(null, 'KES', 2_000)).toBeNull();
  });

  it('describes cache age', () => {
    expect(describeAge(10_000)).toBe('just now');
    expect(describeAge(5 * 60_000)).toBe('5 min ago');
    expect(describeAge(3 * 3_600_000)).toBe('3 h ago');
  });
});

describe('FxConversionPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the live fiat estimate and the settlement disclaimer', async () => {
    getRate.mockResolvedValue({ data: { base_currency: 'NGN', target_currency: 'USDC', rate: 0.000625 } });

    render(<FxConversionPreview usdcAmount={25} initialCurrency="NGN" />);

    expect(await screen.findByText(/40,000\.00/)).toBeInTheDocument();
    expect(getRate).toHaveBeenCalledWith('NGN');
    expect(screen.getByText(/final settlement exchange rates may vary/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NGN' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets the customer switch the reference currency and remembers it', async () => {
    getRate.mockImplementation(async (currency: string) => ({
      data: { base_currency: currency, target_currency: 'USDC', rate: currency === 'KES' ? 0.0078125 : 1 },
    }));

    render(<FxConversionPreview usdcAmount={25} initialCurrency="USD" />);
    expect(await screen.findByText(/25\.00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'KES' }));
    expect(await screen.findByText(/3,200\.00/)).toBeInTheDocument();
    expect(getRate).toHaveBeenLastCalledWith('KES');
    expect(screen.getByRole('button', { name: 'KES' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('fluxapay:fx:preferred-currency')).toBe('KES');
  });

  it('flags a stale rate from the backend', async () => {
    getRate.mockResolvedValue({ data: { base_currency: 'GHS', target_currency: 'USDC', rate: 0.08, stale: true } });

    render(<FxConversionPreview usdcAmount={10} initialCurrency="GHS" />);

    expect(await screen.findByText(/125\.00/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/may be out of date/i);
  });

  it('falls back to the last cached rate when the live rate fails', async () => {
    writeCachedRate(window.localStorage, 'NGN', { rate: 0.0005, fetchedAt: Date.now() - 10 * 60_000 });
    getRate.mockResolvedValue({ error: { status: 503, message: 'FX unavailable' } });

    render(<FxConversionPreview usdcAmount={25} initialCurrency="NGN" />);

    expect(await screen.findByText(/50,000\.00/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/last known rate from 10 min ago/i);
  });

  it('uses the cache without a request while offline', async () => {
    writeCachedRate(window.localStorage, 'USD', { rate: 1, fetchedAt: Date.now() });
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

    render(<FxConversionPreview usdcAmount={12.5} initialCurrency="USD" />);

    expect(await screen.findByText(/12\.50/)).toBeInTheDocument();
    expect(getRate).not.toHaveBeenCalled();
  });

  it('says the rate is unavailable when there is no live or cached rate', async () => {
    getRate.mockRejectedValue(new Error('network down'));

    render(<FxConversionPreview usdcAmount={25} initialCurrency="KES" />);

    await waitFor(() =>
      expect(screen.getByText(/live KES rate unavailable/i)).toBeInTheDocument(),
    );
  });
});
