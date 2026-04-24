'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Payment } from '@/types/payment';

type ConnectionType = 'sse' | 'polling' | null;

interface UsePaymentStatusReturn {
  payment: Payment | null;
  loading: boolean;
  error: string | null;
  connectionType: ConnectionType;
  isOffline: boolean;
  retryConnection: () => Promise<void>;
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

  // Use refs to track mutable state without triggering re-renders or lint issues
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentRef = useRef<Payment | null>(null);
  const pollingBackoffRef = useRef<number>(3000);
  const reconnectBackoffRef = useRef<number>(1000);

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

      const data = await response.json();
      const raw = data as Record<string, unknown>;
      const paymentData: Payment = {
        ...(data as Payment),
        expiresAt: new Date((data as { expiresAt?: string }).expiresAt as string),
        checkoutLogoUrl:
          (raw.checkoutLogoUrl as string | undefined) ??
          (raw.checkout_logo_url as string | undefined),
        checkoutAccentColor:
          (raw.checkoutAccentColor as string | undefined) ??
          (raw.checkout_accent_color as string | undefined),
        paidAmount:
          (raw.paidAmount as number | undefined) ??
          (raw.paid_amount as number | undefined),
      };

      pollingBackoffRef.current = 3000;
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
        if (prev.status !== data.status) {
          return { ...prev, status: data.status };
        }
        return prev;
      });
      pollingBackoffRef.current = 3000;
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

    const scheduleSseReconnect = () => {
      if (cancelled || isOffline) return;
      const delay = reconnectBackoffRef.current;
      reconnectBackoffRef.current = Math.min(reconnectBackoffRef.current * 2, 30000);
      setTimeout(() => {
        if (cancelled) return;
        startPollingFallback();
      }, delay);
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
            if (['confirmed', 'expired', 'failed', 'partially_paid', 'overpaid'].includes(data.status)) {
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
          scheduleSseReconnect();
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

  return { payment, loading, error, connectionType, isOffline, retryConnection };
}
