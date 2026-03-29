'use client';

import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface PaymentStatusProps {
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  message?: string;
}

/**
 * Component to display payment status with appropriate icons and messages
 */
export function PaymentStatus({ status, message }: PaymentStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'confirmed':
        return {
          icon: CheckCircle,
          iconColor: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          defaultMessage: 'Payment Confirmed!',
        };
      case 'expired':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          defaultMessage: 'Payment Expired',
        };
      case 'failed':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          defaultMessage: 'Payment Failed',
        };
      case 'pending':
      default:
        return {
          icon: Loader2,
          iconColor: 'text-[color:var(--checkout-accent)]',
          bgColor: 'bg-transparent',
          borderColor: 'border-transparent',
          defaultMessage: 'Waiting for payment...',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const isPending = status === 'pending';
  const statusMessage = message || config.defaultMessage;

  const pendingStyle = isPending
    ? ({
        borderColor: `color-mix(in srgb, var(--checkout-accent) 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, var(--checkout-accent) 12%, white)`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Payment status: ${statusMessage}`}
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border px-6 py-4 ${config.bgColor} ${config.borderColor}`}
      style={pendingStyle}
    >
      <Icon
        aria-hidden="true"
        className={`h-8 w-8 ${config.iconColor} ${isPending ? 'animate-spin' : ''}`}
      />
      <p className={`font-semibold ${config.iconColor}`}>{statusMessage}</p>
    </div>
  );
}
