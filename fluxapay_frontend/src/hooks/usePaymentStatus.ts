'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Payment } from '@/types/payment';
import {
  isTerminalStatus,
  normalizePaymentResponse,
  PaymentParseError,
  usePaymentNormalization,
} from './usePaymentNormalization';
import { usePaymentPolling, type ConnectionType } from './usePaymentPolling';
import { useSSE } from './useSSE';

// Re-exported so existing consumers/tests can import normalization and the
// payment-parsing error from the original module path.
export { isTerminalStatus, normalizePaymentResponse, PaymentParseError } from './usePaymentNormalization';

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
 * Composes smaller, single-responsibility hooks:
 *   - `usePaymentNormalization`  → payment parsing + state/merge management
 *   - `usePaymentPolling`        → 3s-ish polling fallback with backoff
 *   - `useSSE`                   → real-time EventSource push channel
 * Tries SSE first, falls back to polling if SSE is unavailable or fails.
 */
export function usePaymentStatus(paymentId: string): UsePaymentStatusReturn {
  const [connectionType, setConnectionType] = useState<ConnectionType>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);

  const {
    payment,
    paymentRef,
    setPayment,
    applyPaymentUpdate,
    depositAddressUpdated,
    setDepositAddressUpdated,
  } = usePaymentNormalization();

  // Online/offline tracking
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateOnlineStatus = () => {
      const offline = !window.navigator.onLine;
      setIsOffline(offline);
      if (!offline) {
        setError(null);
      }
    };

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const calculateServerTimeOffset = useCallback((dateHeader: string | null) => {
    if (dateHeader) {
      const serverTime = new Date(dateHeader).getTime();
      const clientTime = new Date().getTime();
      return serverTime - clientTime;
    }
    return 0;
  }, []);

  const fetchPayment = useCallback(async () => {
    try {
      const response = await fetch(`/api/payments/${paymentId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Payment not found');
        } else {
          setError('Failed to fetch payment details');
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

      setPayment(paymentData);
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  }, [paymentId, calculateServerTimeOffset, setPayment]);

  // Initial fetch
  useEffect(() => {
    void fetchPayment();
  }, [fetchPayment]);

  const polling = usePaymentPolling({
    paymentId,
    isOffline,
    paymentRef,
    applyPaymentUpdate,
    setConnectionType,
  });

  // Connect the real-time channel once the initial fetch has landed and the
  // payment is not already in a terminal state.
  useSSE({
    paymentId,
    active: !loading && !!payment && !isTerminalStatus(payment.status),
    isOffline,
    applyPaymentUpdate,
    setConnectionType,
    onFallbackToPolling: polling.startPolling,
    onTeardown: polling.stop,
  });

  const retryConnection = useCallback(async () => {
    setError(null);
    setLoading(paymentRef.current === null);
    await fetchPayment();
  }, [fetchPayment, paymentRef]);

  // Auto-clear the depositAddressUpdated flag after one tick so consumers
  // can use it as a one-shot signal without managing their own reset.
  useEffect(() => {
    if (!depositAddressUpdated) return;
    const id = setTimeout(() => setDepositAddressUpdated(false), 0);
    return () => clearTimeout(id);
  }, [depositAddressUpdated, setDepositAddressUpdated]);

  return {
    payment,
    loading,
    error,
    connectionType,
    isOffline,
    retryConnection,
    serverTimeOffset,
    depositAddressUpdated,
  };
}
