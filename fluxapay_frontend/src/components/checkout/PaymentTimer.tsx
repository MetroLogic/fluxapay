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

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
        isExpired
          ? 'bg-red-100 text-red-700 border border-red-300'
          : 'bg-blue-100 text-blue-700 border border-blue-300'
      }`}
    >
      <Clock className="w-4 h-4" />
      <span className="text-lg">
        {isExpired ? 'Expired' : formatTime(timeLeft)}
      </span>
    </div>
  );
}
