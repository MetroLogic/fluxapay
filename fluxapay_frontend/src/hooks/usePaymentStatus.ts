'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

  // Use refs to track mutable state without triggering re-renders or lint issues
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paymentRef = useRef<Payment | null>(null);

  // Keep paymentRef in sync
  useEffect(() => {
    paymentRef.current = payment;
  }, [payment]);

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

  // Polling callback — uses ref to avoid stale closures
  const pollStatus = useCallback(async () => {
    const current = paymentRef.current;
    if (current && ['confirmed', 'expired', 'failed'].includes(current.status)) {
      return;
    }

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

  // SSE / polling lifecycle — runs once after initial fetch completes
  useEffect(() => {
    if (loading || !payment) return;

    // Don't connect if payment is in terminal state
    if (['confirmed', 'expired', 'failed'].includes(payment.status)) {
      return;
    }

    let cancelled = false;

    const startPollingFallback = () => {
      if (cancelled || pollingRef.current) return;
      setConnectionType('polling');
      pollingRef.current = setInterval(pollStatus, 3000);
    };

    // Try SSE first
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      try {
        const es = new EventSource(`/api/payments/${paymentId}/stream`);
        eventSourceRef.current = es;

        es.onopen = () => {
          if (!cancelled) setConnectionType('sse');
        };

        es.onmessage = (event) => {
          if (cancelled) return;
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
          startPollingFallback();
        };
      } catch {
        // EventSource construction failed — fall back to polling
        startPollingFallback();
      }
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
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
    // Only re-run when paymentId changes or initial load completes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, paymentId]);

  return { payment, loading, error, connectionType };
}
