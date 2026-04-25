'use client';

import { CheckCircle, XCircle, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';

interface PaymentStatusProps {
  status: 'pending' | 'confirmed' | 'expired' | 'failed' | 'partially_paid' | 'overpaid';
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
          ariaLabel: 'Payment status: Payment Confirmed',
        };
      case 'expired':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          defaultMessage: 'Payment Expired',
          ariaLabel: 'Payment status: Payment Expired',
        };
      case 'failed':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          defaultMessage: 'Payment Failed',
          ariaLabel: 'Payment status: Payment Failed',
        };
      case 'partially_paid':
        return {
          icon: AlertTriangle,
          iconColor: 'text-amber-600',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          defaultMessage: 'Partial Payment Received',
          ariaLabel: 'Payment status: Partial Payment Received',
        };
      case 'overpaid':
        return {
          icon: AlertCircle,
          iconColor: 'text-orange-600',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200',
          defaultMessage: 'Overpayment Detected',
          ariaLabel: 'Payment status: Overpayment Detected',
        };
      case 'pending':
      default:
        return {
          icon: Loader2,
          iconColor: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          defaultMessage: 'Waiting for payment...',
          ariaLabel: 'Payment status: Waiting for payment',
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
      aria-label={config.ariaLabel}
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
