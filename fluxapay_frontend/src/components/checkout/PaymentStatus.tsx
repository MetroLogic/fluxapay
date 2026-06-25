'use client';

import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PaymentStatus } from '../../types/payment';

interface PaymentStatusProps {
  status: PaymentStatus;
  message?: string;
}

/**
 * Component to display payment status with appropriate icons and messages
 */
export function PaymentStatus({ status, message }: PaymentStatusProps) {
  const t = useTranslations('payment');
  
  const getStatusConfig = () => {
    switch (status) {
      case 'confirmed':
        return {
          icon: CheckCircle,
          iconColor: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          defaultMessage: t('checkout.confirmed'),
        };
      case 'expired':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          defaultMessage: t('checkout.expiredDescription'), // Wait, en.json has "expired" too.
        };
      case 'failed':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          defaultMessage: t('failed'),
        };
      case 'partially_paid':
        return {
          icon: AlertCircle,
          iconColor: 'text-amber-600',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          defaultMessage: t('checkout.partialReceived'),
        };
      case 'overpaid':
        return {
          icon: AlertCircle,
          iconColor: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          defaultMessage: t('checkout.overpaymentReceived'),
        };
      case 'paid':
      case 'completed':
        return {
          icon: CheckCircle,
          iconColor: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          defaultMessage: t('status.completed'), // Using common status
        };
      case 'pending':
      default:
        return {
          icon: Loader2,
          iconColor: 'text-[color:var(--checkout-accent)]',
          bgColor: 'bg-transparent',
          borderColor: 'border-transparent',
          defaultMessage: t('waitingForPayment'),
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
