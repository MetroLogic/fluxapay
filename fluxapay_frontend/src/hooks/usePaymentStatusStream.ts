'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Payment } from '@/types/payment';
import {
  isTerminalStatus,
  normalizePaymentResponse,
  usePaymentNormalization,
} from './usePaymentNormalization';
import { usePaymentPolling, type ConnectionType } from './usePaymentPolling';
import { useSSE } from './useSSE';

/**
 * High-level, human-meaningful stage of a checkout payment. Derived from the
 * raw `PaymentStatus` (plus the detected `paidAmount`) so the UI can render a
 * smooth "awaiting → detected (confirming) → confirmed" narrative without
 * every consumer re-implementing the mapping (#1252).
 */
export type PaymentStreamStage =
  | 'awaiting'
  | 'confirming'
  | 'confirmed'
  | 'underpaid'
  | 'overpaid'
  | 'expired'
  | 'failed';

/** Transport currently carrying real-time updates. */
export type StreamConnectionType = 'websocket' | ConnectionType;

const WS_RECONNECT_BASE_DELAY_MS = 1000;
const WS_RECONNECT_MAX_DELAY_MS = 15000;
const WS_MAX_CONSECUTIVE_FAILURES = 3;

/** Map a normalized payment into a coarse, UI-friendly stage. */
export function derivePaymentStage(payment: Payment | null): PaymentStreamStage {
  if (!payment) return 'awaiting';

  switch (payment.status) {
    case 'confirmed':
    case 'paid':
    case 'completed':
    case 'refunded':
    case 'partially_refunded':
      return 'confirmed';
    case 'partially_paid':
      return 'underpaid';
    case 'overpaid':
      return 'overpaid';
    case 'expired':
      return 'expired';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'pending':
    default:
      // Funds detected on-chain but not yet fully confirmed.
      return (payment.paidAmount ?? 0) > 0 ? 'confirming' : 'awaiting';
  }
}

interface UsePaymentStatusStreamOptions {
  /**
   * WebSocket endpoint for real-time updates. May contain `:id` or
   * `{paymentId}` placeholders; otherwise the payment id is appended. Falls
   * back to `NEXT_PUBLIC_PAYMENT_WS_URL` when omitted. When no URL is
   * configured (or WebSocket is unavailable) the hook uses SSE and then
   * adaptive polling.
   */
  wsUrl?: string;
}

interface UsePaymentStatusStreamReturn {
  payment: Payment | null;
  stage: PaymentStreamStage;
  connectionType: StreamConnectionType;
  loading: boolean;
  error: string | null;
  isOffline: boolean;
  retryConnection: () => Promise<void>;
  depositAddressUpdated: boolean;
}

/** Resolve a WS template into a concrete URL for a given payment id. */
function resolveWsUrl(template: string, paymentId: string): string {
  const id = encodeURIComponent(paymentId);
  if (template.includes(':id')) return template.replace(':id', id);
  if (template.includes('{paymentId}')) return template.replace('{paymentId}', id);
  return `${template.replace(/\/$/, '')}/${id}`;
}

/**
 * Real-time checkout payment status listener (#1252).
 *
 * Transport cascade, in order of preference:
 *   1. WebSocket   — when a WS URL is configured and supported.
 *   2. SSE         — `/api/payments/:id/stream` (existing push channel).
 *   3. Polling     — adaptive backoff fallback when push is unavailable.
 *
 * The hook also derives a coarse `stage` for animated, accessible status
 * transitions. It mirrors the public surface of `usePaymentStatus` so the
 * checkout page can swap transports without changing its rendering logic.
 */
export function usePaymentStatusStream(
  paymentId: string,
  { wsUrl }: UsePaymentStatusStreamOptions = {},
): UsePaymentStatusStreamReturn {
  const resolvedWsUrl = wsUrl ?? process.env.NEXT_PUBLIC_PAYMENT_WS_URL;

  const [connectionType, setConnectionType] =
    useState<StreamConnectionType>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsExhausted, setWsExhausted] = useState(false);

  const {
    payment,
    paymentRef,
    setPayment,
    applyPaymentUpdate,
    depositAddressUpdated,
    setDepositAddressUpdated,
  } = usePaymentNormalization();

  const applyPaymentUpdateRef = useRef(applyPaymentUpdate);
  applyPaymentUpdateRef.current = applyPaymentUpdate;
  const setConnectionTypeRef = useRef(setConnectionType);
  setConnectionTypeRef.current = setConnectionType;

  // Online/offline tracking (mirrors usePaymentStatus).
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateOnlineStatus = () => {
      const offline = !window.navigator.onLine;
      setIsOffline(offline);
      if (!offline) setError(null);
    };

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const fetchPayment = useCallback(async () => {
    try {
      const response = await fetch(`/api/payments/${paymentId}`);

      if (!response.ok) {
        setError(
          response.status === 404
            ? 'Payment not found'
            : 'Failed to fetch payment details',
        );
        setLoading(false);
        return;
      }

      const data = await response.json();
      setPayment(normalizePaymentResponse(data));
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  }, [paymentId, setPayment]);

  useEffect(() => {
    void fetchPayment();
  }, [fetchPayment]);

  // A new payment id restarts the transport cascade from the top.
  useEffect(() => {
    setWsExhausted(false);
  }, [paymentId]);

  const ready = !loading && !!payment && !isTerminalStatus(payment.status);
  const wsSupported =
    resolvedWsUrl !== undefined &&
    resolvedWsUrl !== '' &&
    typeof WebSocket !== 'undefined';
  // While a WebSocket is configured and not yet exhausted, keep SSE idle so the
  // two push channels never race each other.
  const wsActive = wsSupported && !wsExhausted;

  // WebSocket transport.
  useEffect(() => {
    if (!wsSupported || !ready || isOffline) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let failures = 0;
    let backoff = WS_RECONNECT_BASE_DELAY_MS;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const giveUp = () => {
      if (cancelled) return;
      setWsExhausted(true);
    };

    const handleDrop = () => {
      if (cancelled || socket === null) return;
      const dead = socket;
      socket = null;
      dead.onopen = null;
      dead.onmessage = null;
      dead.onerror = null;
      dead.onclose = null;

      failures += 1;
      if (failures >= WS_MAX_CONSECUTIVE_FAILURES) {
        giveUp();
        return;
      }
      const delay = backoff;
      backoff = Math.min(backoff * 2, WS_RECONNECT_MAX_DELAY_MS);
      retryTimer = setTimeout(connect, delay);
    };

    function connect() {
      if (cancelled) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(resolveWsUrl(resolvedWsUrl as string, paymentId));
      } catch {
        giveUp();
        return;
      }
      socket = ws;

      ws.onopen = () => {
        if (cancelled) return;
        failures = 0;
        backoff = WS_RECONNECT_BASE_DELAY_MS;
        setConnectionTypeRef.current('websocket');
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data);
          applyPaymentUpdateRef.current(data);
          if (
            data &&
            typeof data.status === 'string' &&
            isTerminalStatus(data.status)
          ) {
            ws.close();
          }
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onerror = handleDrop;
      ws.onclose = handleDrop;
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        socket = null;
      }
    };
  }, [wsSupported, ready, isOffline, resolvedWsUrl, paymentId]);

  const polling = usePaymentPolling({
    paymentId,
    isOffline,
    paymentRef,
    applyPaymentUpdate,
    setConnectionType,
  });

  // SSE is only engaged once WebSocket is unavailable/exhausted.
  useSSE({
    paymentId,
    active: ready && !wsActive,
    isOffline,
    applyPaymentUpdate,
    setConnectionType,
    onFallbackToPolling: polling.startPolling,
    onTeardown: polling.stop,
  });

  const retryConnection = useCallback(async () => {
    setError(null);
    setWsExhausted(false);
    setLoading(paymentRef.current === null);
    await fetchPayment();
  }, [fetchPayment, paymentRef]);

  // One-shot deposit-address-change signal.
  useEffect(() => {
    if (!depositAddressUpdated) return;
    const id = setTimeout(() => setDepositAddressUpdated(false), 0);
    return () => clearTimeout(id);
  }, [depositAddressUpdated, setDepositAddressUpdated]);

  return {
    payment,
    stage: derivePaymentStage(payment),
    connectionType,
    loading,
    error,
    isOffline,
    retryConnection,
    depositAddressUpdated,
  };
}
