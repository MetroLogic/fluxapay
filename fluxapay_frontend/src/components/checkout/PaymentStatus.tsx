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
          iconColor: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          defaultMessage: 'Waiting for payment...',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const isPending = status === 'pending';
  const statusMessage = message || config.defaultMessage;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Payment status: ${statusMessage}`}
      className={`flex flex-col items-center justify-center gap-3 px-6 py-4 rounded-lg border ${config.bgColor} ${config.borderColor}`}
    >
      <Icon
        aria-hidden="true"
        className={`w-8 h-8 ${config.iconColor} ${isPending ? 'animate-spin' : ''}`}
      />
      <p className={`font-semibold ${config.iconColor}`}>
        {statusMessage}
      </p>
    </div>
  );
}
