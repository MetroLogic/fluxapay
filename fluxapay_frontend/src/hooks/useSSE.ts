'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Payment } from '@/types/payment';
import {
  isTerminalStatus,
  type PaymentUpdate,
} from './usePaymentNormalization';
import type { ConnectionType } from './usePaymentPolling';

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

export interface UseSSEOptions {
  paymentId: string;
  /** True when the hook should attempt to connect (loaded, not terminal). */
  active: boolean;
  /** Re-run the connection lifecycle when this flips (mirrors online/offline). */
  isOffline: boolean;
  applyPaymentUpdate: (data: PaymentUpdate) => void;
  setConnectionType: (type: ConnectionType) => void;
  /** Called once SSE has exhausted its retries and we should poll instead. */
  onFallbackToPolling: () => void;
  /** Called on unmount/teardown so the orchestrator can clear the polling timer. */
  onTeardown: () => void;
}

/**
 * Owns the SSE (EventSource) connection to `/api/payments/:id/stream`,
 * including the exponential-reconnect-with-jitter policy and the fallback to
 * polling after `SSE_MAX_CONSECUTIVE_FAILURES` consecutive failures. Single
 * responsibility: the real-time push channel.
 */
export function useSSE({
  paymentId,
  active,
  isOffline,
  applyPaymentUpdate,
  setConnectionType,
  onFallbackToPolling,
  onTeardown,
}: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectBackoffRef = useRef<number>(SSE_RECONNECT_BASE_DELAY_MS);
  const sseFailureCountRef = useRef<number>(0);
  const cancelledRef = useRef(true);
  const connectSseRef = useRef<() => void>(() => {});
  const applyUpdateRef = useRef(applyPaymentUpdate);
  applyUpdateRef.current = applyPaymentUpdate;
  const setConnectionTypeRef = useRef(setConnectionType);
  setConnectionTypeRef.current = setConnectionType;
  const onFallbackRef = useRef(onFallbackToPolling);
  onFallbackRef.current = onFallbackToPolling;

  const connectSse = useCallback(() => {
    if (cancelledRef.current) return;

    let es: EventSource;
    try {
      es = new EventSource(`/api/payments/${paymentId}/stream`);
    } catch {
      // EventSource construction failed — fall back to polling
      onFallbackRef.current();
      return;
    }
    eventSourceRef.current = es;

    es.onopen = () => {
      if (cancelledRef.current) return;
      setConnectionTypeRef.current('sse');
      // A successful connection resets the backoff and failure streak.
      reconnectBackoffRef.current = SSE_RECONNECT_BASE_DELAY_MS;
      sseFailureCountRef.current = 0;
    };

    es.onmessage = (event) => {
      if (cancelledRef.current) return;
      try {
        const data = JSON.parse(event.data);
        applyUpdateRef.current(data);

        // Close SSE on terminal states
        if (
          data &&
          typeof data.status === 'string' &&
          isTerminalStatus(data.status)
        ) {
          es.close();
          eventSourceRef.current = null;
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      if (cancelledRef.current) return;
      es.close();
      eventSourceRef.current = null;

      sseFailureCountRef.current += 1;
      if (sseFailureCountRef.current >= SSE_MAX_CONSECUTIVE_FAILURES) {
        onFallbackRef.current();
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
        if (cancelledRef.current) return;
        connectSseRef.current();
      }, delay);
    };
  }, [paymentId]);

  connectSseRef.current = connectSse;

  useEffect(() => {
    // Don't connect while still loading, before data arrives, or for a
    // terminal payment.
    if (!active) return;

    cancelledRef.current = false;
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      connectSse();
    } else {
      // No EventSource support — use polling
      onFallbackRef.current();
    }

    return () => {
      cancelledRef.current = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      onTeardown();
    };
    // `isOffline` intentionally in deps: flipping offline/online re-establishes
    // the connection lifecycle (behaviour mirrors the legacy single effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isOffline, connectSse]);

  return null;
}
