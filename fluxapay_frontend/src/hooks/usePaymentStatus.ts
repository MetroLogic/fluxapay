'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Payment } from '@/types/payment';

type ConnectionType = 'sse' | 'polling' | null;

interface UsePaymentStatusReturn {
  payment: Payment | null;
  loading: boolean;
  error: string | null;
  connectionType: ConnectionType;
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
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling fallback
  const pollStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/payments/${paymentId}/status`);
      if (!response.ok) return;

      const data = await response.json();

      setPayment((prev) => {
        if (!prev) return prev;
        if (prev.status !== data.status) {
          return { ...prev, status: data.status };
        }
        return prev;
      });
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, [paymentId]);

  // Start polling fallback
  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // Already polling
    setConnectionType('polling');
    pollingRef.current = setInterval(pollStatus, 3000);
  }, [pollStatus]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Connect SSE
  const connectSSE = useCallback(() => {
    if (typeof window === 'undefined' || !('EventSource' in window)) {
      startPolling();
      return;
    }

    try {
      const es = new EventSource(`/api/payments/${paymentId}/stream`);
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnectionType('sse');
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setPayment((prev) => {
            if (!prev) return prev;
            if (prev.status !== data.status) {
              return { ...prev, status: data.status };
            }
            return prev;
          });

          // Close SSE on terminal states
          if (['confirmed', 'expired', 'failed'].includes(data.status)) {
            es.close();
            eventSourceRef.current = null;
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        // SSE failed — close and fall back to polling
        es.close();
        eventSourceRef.current = null;
        startPolling();
      };
    } catch {
      // EventSource construction failed — fall back to polling
      startPolling();
    }
  }, [paymentId, startPolling]);

  // Initial fetch
  useEffect(() => {
    let isMounted = true;

    async function fetchPayment() {
      try {
        const response = await fetch(`/api/payments/${paymentId}`);

        if (!isMounted) return;

        if (!response.ok) {
          if (response.status === 404) {
            setError('Payment not found');
          } else {
            setError('Failed to fetch payment details');
          }
          setLoading(false);
          return;
        }

        const data = await response.json();

        if (!isMounted) return;

        const paymentData: Payment = {
          ...data,
          expiresAt: new Date(data.expiresAt),
        };

        setPayment(paymentData);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'An error occurred');
        setLoading(false);
      }
    }

    fetchPayment();

    return () => {
      isMounted = false;
    };
  }, [paymentId]);

  // Start SSE/polling after initial fetch
  useEffect(() => {
    if (loading || !payment) return;

    // Don't connect if payment is in terminal state
    if (['confirmed', 'expired', 'failed'].includes(payment.status)) {
      return;
    }

    // Try SSE first, falls back to polling internally
    connectSSE();

    return () => {
      // Clean up SSE
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Clean up polling
      stopPolling();
    };
  }, [loading, payment?.status, connectSSE, stopPolling]); // eslint-disable-line react-hooks/exhaustive-deps

  return { payment, loading, error, connectionType };
}
