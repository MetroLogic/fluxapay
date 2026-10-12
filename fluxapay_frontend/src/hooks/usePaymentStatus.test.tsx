import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { normalizePaymentResponse, PaymentParseError, usePaymentStatus } from './usePaymentStatus';

describe('normalizePaymentResponse', () => {
  const VALID_PAYMENT = {
    id: 'pay_123',
    amount: 10,
    currency: 'USDC',
    address: 'GABCDEF',
    expiresAt: '2026-06-27T12:00:00.000Z',
    status: 'pending',
  };

  it('throws PaymentParseError when a required field is missing (e.g. address)', () => {
    const { address: _address, ...withoutAddress } = VALID_PAYMENT;
    expect(() => normalizePaymentResponse(withoutAddress)).toThrow(PaymentParseError);
    try {
      normalizePaymentResponse(withoutAddress);
      throw new Error('expected normalizePaymentResponse to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentParseError);
      expect((err as PaymentParseError).fieldErrors.address).toBeDefined();
    }
  });

  it('throws PaymentParseError when amount is missing', () => {
    const { amount: _amount, ...withoutAmount } = VALID_PAYMENT;
    expect(() => normalizePaymentResponse(withoutAmount)).toThrow(PaymentParseError);
  });

  it('throws PaymentParseError when status is not a recognized PaymentStatus', () => {
    expect(() =>
      normalizePaymentResponse({ ...VALID_PAYMENT, status: 'not_a_real_status' }),
    ).toThrow(PaymentParseError);
  });

  it('throws PaymentParseError when expiresAt is not a parseable date', () => {
    expect(() =>
      normalizePaymentResponse({ ...VALID_PAYMENT, expiresAt: 'not-a-date' }),
    ).toThrow(PaymentParseError);
  });

  it('throws PaymentParseError on a completely empty response', () => {
    expect(() => normalizePaymentResponse({})).toThrow(PaymentParseError);
  });

  it('does not throw for a fully valid response', () => {
    expect(() => normalizePaymentResponse(VALID_PAYMENT)).not.toThrow();
    const result = normalizePaymentResponse(VALID_PAYMENT);
    expect(result.id).toBe('pay_123');
    expect(result.expiresAt).toEqual(new Date('2026-06-27T12:00:00.000Z'));
  });

  it('maps merchant_branding from charge API responses into checkout branding fields', () => {
    const payment = normalizePaymentResponse({
      id: 'ch_123',
      amount: 25,
      currency: 'USDC',
      address: 'GABC',
      expiresAt: '2026-06-27T12:00:00.000Z',
      status: 'pending',
      merchant_branding: {
        logo_url: 'https://cdn.example.com/acme.png',
        primary_color: 'ff5500',
        business_name: 'Acme Store',
      },
    });

    expect(payment.checkoutLogoUrl).toBe('https://cdn.example.com/acme.png');
    expect(payment.checkoutAccentColor).toBe('#ff5500');
    expect(payment.merchantName).toBe('Acme Store');
    expect(payment.expiresAt).toEqual(new Date('2026-06-27T12:00:00.000Z'));
  });

  it('keeps legacy top-level checkout branding fields as fallbacks', () => {
    const payment = normalizePaymentResponse({
      id: 'pay_123',
      amount: 10,
      currency: 'USDC',
      address: 'GDEF',
      expiresAt: '2026-06-27T12:00:00.000Z',
      status: 'pending',
      merchantName: 'Legacy Store',
      checkoutLogoUrl: 'https://cdn.example.com/legacy.png',
      checkoutAccentColor: '#3366ff',
    });

    expect(payment.checkoutLogoUrl).toBe('https://cdn.example.com/legacy.png');
    expect(payment.checkoutAccentColor).toBe('#3366ff');
    expect(payment.merchantName).toBe('Legacy Store');
  });
});

describe('usePaymentStatus SSE reconnect backoff', () => {
  class MockEventSource {
    static instances: MockEventSource[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    url: string;
    constructor(url: string) {
      this.url = url;
      MockEventSource.instances.push(this);
    }
    close() {
      this.closed = true;
    }
  }

  const originalEventSource = (globalThis as { EventSource?: unknown }).EventSource;
  const originalFetch = globalThis.fetch;

  function mockPaymentFetchResponse() {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        id: 'pay_1',
        amount: 10,
        currency: 'USDC',
        address: 'GABC',
        expiresAt: new Date().toISOString(),
        status: 'pending',
      }),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    (globalThis as { EventSource?: unknown }).EventSource = MockEventSource;
    (window as { EventSource?: unknown }).EventSource = MockEventSource;
    globalThis.fetch = vi.fn().mockResolvedValue(mockPaymentFetchResponse()) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { EventSource?: unknown }).EventSource = originalEventSource;
    (window as { EventSource?: unknown }).EventSource = originalEventSource;
    globalThis.fetch = originalFetch;
  });

  it('retries SSE with exponential backoff (1s, 2s, 4s, 8s, +/-20% jitter) before falling back to polling after 5 failures', async () => {
    const { result } = renderHook(() => usePaymentStatus('pay_1'));

    // Let the initial fetch resolve and the SSE effect mount its first connection.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(MockEventSource.instances.length).toBe(1);

    const expectedBaseDelays = [1000, 2000, 4000, 8000];

    for (let i = 0; i < expectedBaseDelays.length; i++) {
      const es = MockEventSource.instances[i];
      const before = MockEventSource.instances.length;

      act(() => {
        es.onerror?.();
      });

      // No new connection until after the backoff delay elapses.
      expect(MockEventSource.instances.length).toBe(before);

      const base = expectedBaseDelays[i];
      const minDelay = Math.floor(base * 0.8);
      const maxDelay = Math.ceil(base * 1.2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(Math.max(minDelay - 1, 0));
      });
      expect(MockEventSource.instances.length).toBe(before);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(maxDelay - minDelay + 2);
      });
      expect(MockEventSource.instances.length).toBe(before + 1);
    }

    expect(result.current.connectionType).not.toBe('polling');

    // 5th consecutive failure switches to polling instead of retrying SSE again.
    const fifth = MockEventSource.instances[4];
    act(() => {
      fifth.onerror?.();
    });

    await waitFor(() => {
      expect(result.current.connectionType).toBe('polling');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(MockEventSource.instances.length).toBe(5);
  });

  it('resets the backoff and failure count after a successful reconnection', async () => {
    renderHook(() => usePaymentStatus('pay_1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    // First failure -> reconnect after ~1s.
    act(() => {
      MockEventSource.instances[0].onerror?.();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1250);
    });
    expect(MockEventSource.instances.length).toBe(2);

    // That reconnection succeeds.
    act(() => {
      MockEventSource.instances[1].onopen?.();
    });

    // A subsequent failure should back off from ~1s again, not ~2s.
    act(() => {
      MockEventSource.instances[1].onerror?.();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1250);
    });
    expect(MockEventSource.instances.length).toBe(3);
  });
});
