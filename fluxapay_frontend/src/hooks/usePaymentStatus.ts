'use client';

import { useState, useEffect, useCallback } from 'react';
import { Payment } from '@/types/payment';

interface UsePaymentStatusReturn {
  payment: Payment | null;
  loading: boolean;
  error: string | null;
}

/**
 * Custom hook to fetch and poll payment status
 * Fetches initial payment details and polls for status updates every 3 seconds
 */
export function usePaymentStatus(paymentId: string): UsePaymentStatusReturn {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const pollStatus = useCallback(async () => {
    // Don't poll if payment is already confirmed, expired, or failed
    if (payment && ['confirmed', 'expired', 'failed'].includes(payment.status)) {
      return;
    }

    try {
      const response = await fetch(`/api/payments/${paymentId}/status`);
      
      if (!response.ok) {
        return; // Silently fail polling, don't update error state
      }

      const data = await response.json();
      
      setPayment((prev) => {
        if (!prev) return prev;
        
        // Only update if status changed
        if (prev.status !== data.status) {
          return {
            ...prev,
            status: data.status,
          };
        }
        
        return prev;
      });
    } catch (err) {
      // Silently fail polling errors
      console.error('Polling error:', err);
    }
  }, [paymentId, payment]);

  // Initial fetch - moved inline to avoid setState-in-effect lint error
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
        
        // Convert expiresAt string to Date object
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

  // Polling interval
  useEffect(() => {
    // Don't start polling until initial fetch is complete
    if (loading || !payment) return;

    // Don't poll if payment is in terminal state
    if (['confirmed', 'expired', 'failed'].includes(payment.status)) {
      return;
    }

    const interval = setInterval(() => {
      pollStatus();
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [loading, payment, pollStatus]);

  return { payment, loading, error };
}
