'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { z } from 'zod';
import { Payment, PaymentStatus } from '@/types/payment';

const PAYMENT_STATUSES = [
  'pending',
  'partially_paid',
  'confirmed',
  'overpaid',
  'expired',
  'failed',
  'paid',
  'completed',
  'cancelled',
  'refunded',
  'partially_refunded',
] as const satisfies readonly PaymentStatus[];

/**
 * Validates only the fields `normalizePaymentResponse` cannot safely default
 * or derive — everything the rest of the app treats as required on a
 * `Payment`. Extra/branding fields are handled separately below and are
 * intentionally not part of this schema (`.passthrough()` lets them through
 * untouched).
 */
const RequiredPaymentFieldsSchema = z
  .object({
    id: z.string().min(1, 'id is required'),
    amount: z.number({ invalid_type_error: 'amount must be a number' }),
    currency: z.string().min(1, 'currency is required'),
    address: z.string().min(1, 'address is required'),
    status: z.enum(PAYMENT_STATUSES),
    expiresAt: z.string().min(1, 'expiresAt is required'),
  })
  .passthrough();

/**
 * Thrown by `normalizePaymentResponse` when the raw API response is missing
 * (or has the wrong type for) a field the rest of the app requires on a
 * `Payment`. Carries field-level details so callers can surface a specific
 * message instead of an unhandled crash.
 */
export class PaymentParseError extends Error {
  public readonly fieldErrors: Record<string, string[] | undefined>;

  constructor(fieldErrors: Record<string, string[] | undefined>) {
    const fields = Object.keys(fieldErrors).join(', ');
    super(`Payment response is missing or has invalid required field(s): ${fields}`);
    this.name = 'PaymentParseError';
    this.fieldErrors = fieldErrors;
  }
}

type ConnectionType = 'sse' | 'polling' | null;

const SSE_RECONNECT_BASE_DELAY_MS = 1000;
const SSE_RECONNECT_MAX_DELAY_MS = 30000;
const SSE_MAX_CONSECUTIVE_FAILURES = 5;
const SSE_RECONNECT_JITTER_RATIO = 0.2;

/** Applies +/-20% jitter to a backoff delay so simultaneously-disconnected
 *  clients don't all reconnect on the exact same tick (thundering herd). */
function applyJitter(delayMs: number): number {
  const jitter = delayMs * SSE_RECONNECT_JITTER_RATIO;
  return delayMs + (Math.random() * 2 - 1) * jitter;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function normalizeHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const color = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^[0-9a-fA-F]{6}$/.test(color)) return `#${color}`;
  return color;
}

export function normalizePaymentResponse(data: unknown): Payment {
  const raw = asRecord(data);
  const merchantBranding = asRecord(raw.merchant_branding ?? raw.merchantBranding);

  const parsed = RequiredPaymentFieldsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PaymentParseError(parsed.error.flatten().fieldErrors);
  }

  const expiresAtDate = new Date(parsed.data.expiresAt);
  if (Number.isNaN(expiresAtDate.getTime())) {
    throw new PaymentParseError({ expiresAt: ['expiresAt is not a valid date'] });
  }

  return {
    ...(parsed.data as unknown as Payment),
    expiresAt: expiresAtDate,
    merchantName: firstString(
      raw.merchantName,
      raw.merchant_name,
      merchantBranding.businessName,
      merchantBranding.business_name,
      merchantBranding.merchantName,
      merchantBranding.merchant_name
    ),
    checkoutLogoUrl: firstString(
      raw.checkoutLogoUrl,
      raw.checkout_logo_url,
      merchantBranding.logoUrl,
      merchantBranding.logo_url,
      merchantBranding.checkoutLogoUrl,
      merchantBranding.checkout_logo_url
    ),
    checkoutAccentColor: normalizeHexColor(firstString(
      raw.checkoutAccentColor,
      raw.checkout_accent_color,
      merchantBranding.primaryColor,
      merchantBranding.primary_color,
      merchantBranding.brandColor,
      merchantBranding.brand_color,
      merchantBranding.accentColor,
      merchantBranding.accent_color,
      merchantBranding.checkoutAccentColor,
      merchantBranding.checkout_accent_color
    )),
    paidAmount:
      (raw.paidAmount as number | undefined) ??
      (raw.paid_amount as number | undefined),
    supportUrl:
      (raw.supportUrl as string | undefined) ??
      (raw.support_url as string | undefined),
    transactionHash:
      (raw.transactionHash as string | undefined) ??
      (raw.transaction_hash as string | undefined),
  };
}

interface UsePaymentStatusReturn {
  payment: Payment | null;
  loading: boolean;
  error: string | null;
  connectionType: ConnectionType;
  isOffline: boolean;
  retryConnection: () => Promise<void>;
  serverTimeOffset: number;
  /** True for one render cycle when the deposit address has just changed */
  depositAddressUpdated: boolean;
}

/**
 * Custom hook to fetch and stream payment status.
 * Tries SSE (EventSource) first for instant updates.
 * Falls back to 3-second polling if SSE is unavailable.
 */
export function usePaymentStatus(paymentId: string): UsePaymentStatusReturn {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionType, setConnectionType] = useState<ConnectionType>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);
  const [depositAddressUpdated, setDepositAddressUpdated] = useState<boolean>(false);

  // Use refs to track mutable state without triggering re-renders or lint issues
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentRef = useRef<Payment | null>(null);
  const pollingBackoffRef = useRef<number>(10000);
  const reconnectBackoffRef = useRef<number>(1000);
  const sseFailureCountRef = useRef<number>(0);

  // Keep paymentRef in sync
  useEffect(() => {
    paymentRef.current = payment;
  }, [payment]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnlineStatus = () => {
      const offline = !window.navigator.onLine;
      setIsOffline(offline);
      if (!offline) {
        setError(null);
      }
    };

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  const calculateServerTimeOffset = (dateHeader: string | null) => {
    if (dateHeader) {
      const serverTime = new Date(dateHeader).getTime();
      const clientTime = new Date().getTime();
      return serverTime - clientTime;
    }
    return 0;
  };

  const fetchPayment = useCallback(async () => {
    try {
      const response = await fetch(`/api/payments/${paymentId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError("Payment not found");
        } else {
          setError("Failed to fetch payment details");
        }
        setLoading(false);
        return;
      }

      const dateHeader = response.headers.get('date');
      if (dateHeader) {
        setServerTimeOffset(calculateServerTimeOffset(dateHeader));
      }

      const data = await response.json();
      const paymentData = normalizePaymentResponse(data);

      pollingBackoffRef.current = 10000;
      reconnectBackoffRef.current = 1000;
      setPayment(paymentData);
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  }, [paymentId]);

  // Initial fetch
  useEffect(() => {
    void fetchPayment();
  }, [fetchPayment]);

  // Polling callback — uses ref to avoid stale closures
  const pollStatus = useCallback(async () => {
    if (isOffline) return;

    const current = paymentRef.current;
    if (current && ['confirmed', 'expired', 'failed', 'partially_paid', 'overpaid'].includes(current.status)) {
      return;
    }

    try {
      const response = await fetch(`/api/payments/${paymentId}/status`);
      if (!response.ok) return;

      const data = await response.json();

      setPayment((prev) => {
        if (!prev) return prev;
        const statusChanged = prev.status !== data.status;
        const paidAmountChanged = data.paidAmount !== undefined && prev.paidAmount !== data.paidAmount;
        const addressChanged =
          data.address !== undefined &&
          typeof data.address === 'string' &&
          data.address !== '' &&
          prev.address !== data.address;
        if (statusChanged || paidAmountChanged || addressChanged) {
          if (addressChanged) {
            setDepositAddressUpdated(true);
          }
          return {
            ...prev,
            status: data.status,
            ...(data.paidAmount !== undefined ? { paidAmount: data.paidAmount } : {}),
            ...(addressChanged ? { address: data.address as string } : {}),
          };
        }
        return prev;
      });
      pollingBackoffRef.current = 10000;
    } catch (err) {
      console.error('Polling error:', err);
      pollingBackoffRef.current = Math.min(pollingBackoffRef.current * 2, 30000);
    }
  }, [isOffline, paymentId]);

  // SSE / polling lifecycle — runs once after initial fetch completes
  useEffect(() => {
    if (loading || !payment) return;

    // Don't connect if payment is in terminal state
    if (['confirmed', 'expired', 'failed', 'partially_paid', 'overpaid'].includes(payment.status)) {
      return;
    }

    let cancelled = false;

    const stopPolling = () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };

    const schedulePoll = () => {
      if (cancelled) return;
      stopPolling();
      const delay = pollingBackoffRef.current;
      pollingRef.current = setTimeout(async () => {
        await pollStatus();
        schedulePoll();
      }, delay);
    };

    const startPollingFallback = () => {
      if (cancelled) return;
      setConnectionType('polling');
      schedulePoll();
    };

    const connectSse = () => {
      if (cancelled) return;

      let es: EventSource;
      try {
        es = new EventSource(`/api/payments/${paymentId}/stream`);
      } catch {
        // EventSource construction failed — fall back to polling
        startPollingFallback();
        return;
      }
      eventSourceRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        setConnectionType('sse');
        // A successful connection resets the backoff and failure streak.
        reconnectBackoffRef.current = SSE_RECONNECT_BASE_DELAY_MS;
        sseFailureCountRef.current = 0;
      };

      es.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data);
          setPayment((prev) => {
            if (!prev) return prev;
            const statusChanged = prev.status !== data.status;
            const paidAmountChanged = data.paidAmount !== undefined && prev.paidAmount !== data.paidAmount;
            const addressChanged =
              data.address !== undefined &&
              typeof data.address === 'string' &&
              data.address !== '' &&
              prev.address !== data.address;
            if (statusChanged || paidAmountChanged || addressChanged) {
              if (addressChanged) {
                setDepositAddressUpdated(true);
              }
              return {
                ...prev,
                status: data.status,
                ...(data.paidAmount !== undefined ? { paidAmount: data.paidAmount } : {}),
                ...(addressChanged ? { address: data.address as string } : {}),
              };
            }
            return prev;
          });

          // Close SSE on terminal states
          if (['confirmed', 'expired', 'failed', 'partially_paid', 'overpaid'].includes(data.status)) {
            es.close();
            eventSourceRef.current = null;
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        if (cancelled) return;
        es.close();
        eventSourceRef.current = null;

        sseFailureCountRef.current += 1;
        if (sseFailureCountRef.current >= SSE_MAX_CONSECUTIVE_FAILURES) {
          startPollingFallback();
          return;
        }

        // Exponential backoff (1s -> 2s -> 4s ... capped at 30s) with +/-20%
        // jitter, so many simultaneously-dropped clients don't all retry on
        // the same tick and flood the server (thundering herd).
        const delay = applyJitter(reconnectBackoffRef.current);
        reconnectBackoffRef.current = Math.min(
          reconnectBackoffRef.current * 2,
          SSE_RECONNECT_MAX_DELAY_MS,
        );
        setTimeout(() => {
          if (cancelled) return;
          connectSse();
        }, delay);
      };
    };

    // Try SSE first
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      connectSse();
    } else {
      // No EventSource support — use polling
      startPollingFallback();
    }

    return () => {
      cancelled = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
    // Only re-run when paymentId changes or initial load completes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline, loading, paymentId, pollStatus]);

  const retryConnection = useCallback(async () => {
    setError(null);
    setLoading(paymentRef.current === null);
    await fetchPayment();
  }, [fetchPayment]);

  // Auto-clear the depositAddressUpdated flag after one tick so consumers
  // can use it as a one-shot signal without managing their own reset.
  useEffect(() => {
    if (!depositAddressUpdated) return;
    const id = setTimeout(() => setDepositAddressUpdated(false), 0);
    return () => clearTimeout(id);
  }, [depositAddressUpdated]);

  return { payment, loading, error, connectionType, isOffline, retryConnection, serverTimeOffset, depositAddressUpdated };
}
