'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface PaymentTimerProps {
  expiresAt: Date;
  onExpire: () => void;
}

/**
 * Timer component that displays countdown to payment expiration
 * Shows MM:SS format and calls onExpire callback when time runs out
 */
export function PaymentTimer({ expiresAt, onExpire }: PaymentTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const difference = expiry - now;

      if (difference <= 0) {
        setIsExpired(true);
        setTimeLeft(0);
        onExpire();
        return;
      }

      setIsExpired(false);
      setTimeLeft(difference);
    };

    // Calculate immediately
    calculateTimeLeft();

    // Update every second
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const displayText = isExpired ? 'Expired' : formatTime(timeLeft);
  const ariaLabel = isExpired
    ? 'Payment timer expired'
    : `Time remaining: ${Math.floor(timeLeft / 60000)} minutes and ${Math.floor((timeLeft % 60000) / 1000)} seconds`;

  const activeStyle = !isExpired
    ? ({
        color: `color-mix(in srgb, var(--checkout-accent) 92%, black)`,
        borderColor: `color-mix(in srgb, var(--checkout-accent) 45%, transparent)`,
        backgroundColor: `color-mix(in srgb, var(--checkout-accent) 18%, white)`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={ariaLabel}
      className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-4 py-2 font-semibold transition-colors ${isExpired ? 'border-red-300 bg-red-100 text-red-700' : ''}`}
      style={activeStyle}
    >
      <Clock aria-hidden="true" className="w-4 h-4" />
      <span className="text-lg">
        {displayText}
      </span>
    </div>
  );
}
