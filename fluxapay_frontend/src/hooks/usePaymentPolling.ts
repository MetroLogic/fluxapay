'use client';

import { useCallback, useRef } from 'react';
import { Payment } from '@/types/payment';
import {
  isTerminalStatus,
  type PaymentUpdate,
} from './usePaymentNormalization';

export type ConnectionType = 'sse' | 'polling' | null;

export interface UsePaymentPollingOptions {
  paymentId: string;
  isOffline: boolean;
  paymentRef: React.MutableRefObject<Payment | null>;
  applyPaymentUpdate: (data: PaymentUpdate) => void;
  setConnectionType: (type: ConnectionType) => void;
}

export interface UsePaymentPollingReturn {
  /** Start the recursive polling loop (idempotent — resets an active timer). */
  start: () => void;
  /** Stop any pending polling timeout. */
  stop: () => void;
  /** Perform a single status poll now. */
  pollStatus: () => Promise<void>;
  /** Start polling AND report `connectionType === 'polling'`. */
  startPolling: () => void;
}

/**
 * Polling fallback used when SSE is unavailable or has exhausted its retries.
 * Owns the polling timer, its exponential backoff and the single status poll.
 * When a payment reaches a terminal state, `pollStatus` no-ops so the loop
 * stops scheduling further work.
 */
export function usePaymentPolling({
  paymentId,
  isOffline,
  paymentRef,
  applyPaymentUpdate,
  setConnectionType,
}: UsePaymentPollingOptions): UsePaymentPollingReturn {
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingBackoffRef = useRef<number>(10000);
  const startRef = useRef<() => void>(() => {});

  const pollStatus = useCallback(async () => {
    if (isOffline) return;

    const current = paymentRef.current;
    if (current && isTerminalStatus(current.status)) {
      return;
    }

    try {
      const response = await fetch(`/api/payments/${paymentId}/status`);
      if (!response.ok) return;

      const data = await response.json();
      applyPaymentUpdate(data);
      pollingBackoffRef.current = 10000;
    } catch (err) {
      console.error('Polling error:', err);
      pollingBackoffRef.current = Math.min(pollingBackoffRef.current * 2, 30000);
    }
  }, [isOffline, paymentId, paymentRef, applyPaymentUpdate]);

  const stop = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    stop();
    const delay = pollingBackoffRef.current;
    pollingRef.current = setTimeout(async () => {
      await pollStatus();
      startRef.current();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollStatus, stop]);

  const startPolling = useCallback(() => {
    setConnectionType('polling');
    start();
  }, [setConnectionType, start]);

  // Keep latest start in a ref so the recursive loop always references the
  // current closure without re-creating timers.
  startRef.current = start;

  return { start, stop, pollStatus, startPolling };
}
