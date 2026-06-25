"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { PaymentStatus } from "@/features/dashboard/payments/types";

interface PaymentUpdateEvent {
  paymentId: string;
  status: PaymentStatus;
  txHash?: string;
  fiatEquivalent?: number;
  fiatCurrency?: string;
  timestamp: string;
}

interface UsePaymentUpdatesOptions {
  /** Called when a payment status update is received */
  onUpdate: (event: PaymentUpdateEvent) => void;
  /** Whether the hook is active (e.g. set to false when unmounted or paused) */
  enabled?: boolean;
}

/**
 * Hook for real-time payment status updates in the merchant dashboard.
 * Tries SSE first (EventSource), falls back to 5-second polling.
 */
export function usePaymentUpdates({ onUpdate, enabled = true }: UsePaymentUpdatesOptions) {
  const [connectionType, setConnectionType] = useState<"sse" | "polling" | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const lastPollTimestampRef = useRef<string>(new Date().toISOString());

  // Keep callback ref fresh without triggering reconnect
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const closeSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    setConnectionType("polling");
    setIsConnected(true);

    const poll = async () => {
      try {
        const token =
          localStorage.getItem("token") ?? sessionStorage.getItem("token");
        if (!token) return;

        const response = await fetch(
          `/api/v1/payments/updates?since=${encodeURIComponent(lastPollTimestampRef.current)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!response.ok) return;

        const data = (await response.json()) as { updates?: PaymentUpdateEvent[] };
        const updates = data.updates ?? [];

        for (const update of updates) {
          onUpdateRef.current(update);
        }

        if (updates.length > 0) {
          lastPollTimestampRef.current =
            updates[updates.length - 1].timestamp ?? new Date().toISOString();
        }
      } catch {
        // Silent retry on next interval
      }
    };

    pollingRef.current = setInterval(poll, 5000);
  }, [stopPolling]);

  const connect = useCallback(() => {
    if (!enabled) return;

    closeSSE();
    stopPolling();

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("token") ?? sessionStorage.getItem("token")
        : null;

    // Try SSE first
    if (typeof window !== "undefined" && "EventSource" in window && token) {
      try {
        const es = new EventSource(
          `/api/v1/payments/stream?token=${encodeURIComponent(token)}`,
        );
        eventSourceRef.current = es;

        es.onopen = () => {
          setConnectionType("sse");
          setIsConnected(true);
        };

        es.addEventListener("payment_update", (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as PaymentUpdateEvent;
            onUpdateRef.current(data);
          } catch {
            // Ignore parse errors
          }
        });

        es.onerror = () => {
          es.close();
          eventSourceRef.current = null;
          // Fall back to polling
          startPolling();
        };

        return;
      } catch {
        // SSE construction failed — fall back to polling
      }
    }

    startPolling();
  }, [enabled, closeSSE, stopPolling, startPolling]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      closeSSE();
      stopPolling();
      setIsConnected(false);
      setConnectionType(null);
    }

    return () => {
      closeSSE();
      stopPolling();
    };
  }, [enabled, connect, closeSSE, stopPolling]);

  return { connectionType, isConnected, reconnect: connect };
}
