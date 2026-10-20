'use client';

import { AlertCircle, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import type {
  PaymentStreamStage,
  StreamConnectionType,
} from '@/hooks/usePaymentStatusStream';

interface PaymentStatusIndicatorProps {
  stage: PaymentStreamStage;
  /** Transport currently delivering updates, used for the live/polling hint. */
  connectionType?: StreamConnectionType;
  /** Remaining amount for an underpaid payment (display only). */
  shortfall?: number;
  currency?: string;
  className?: string;
}

type Tone = 'accent' | 'green' | 'orange' | 'blue' | 'red';

interface Visual {
  Icon: typeof CheckCircle;
  tone: Tone;
  titleKey: string;
  descriptionKey: string;
  /** Whether the icon should spin (in-flight states). */
  spin?: boolean;
  /** Whether to play the confirmation check-pop animation. */
  pop?: boolean;
}

const TONE_WRAP: Record<Tone, string> = {
  accent: '',
  green: 'border-green-200 bg-green-50',
  orange: 'border-orange-200 bg-orange-50',
  blue: 'border-blue-200 bg-blue-50',
  red: 'border-red-200 bg-red-50',
};

const TONE_ICON: Record<Tone, string> = {
  accent: '',
  green: 'text-green-600',
  orange: 'text-orange-600',
  blue: 'text-blue-600',
  red: 'text-red-600',
};

const accentWrapStyle: CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--checkout-accent) 40%, transparent)',
  backgroundColor: 'color-mix(in srgb, var(--checkout-accent) 12%, white)',
};

const accentRingStyle: CSSProperties = {
  borderColor: 'var(--checkout-accent)',
};

const accentIconStyle: CSSProperties = { color: 'var(--checkout-accent)' };

function visualFor(stage: PaymentStreamStage): Visual {
  switch (stage) {
    case 'confirmed':
      return {
        Icon: CheckCircle,
        tone: 'green',
        titleKey: 'checkout.confirmed',
        descriptionKey: 'checkout.confirmedDescription',
        pop: true,
      };
    case 'confirming':
      return {
        Icon: Loader2,
        tone: 'accent',
        titleKey: 'checkout.statusConfirming',
        descriptionKey: 'checkout.statusConfirmingDescription',
        spin: true,
      };
    case 'underpaid':
      return {
        Icon: AlertCircle,
        tone: 'orange',
        titleKey: 'checkout.statusUnderpaid',
        descriptionKey: 'checkout.statusUnderpaidDescription',
      };
    case 'overpaid':
      return {
        Icon: AlertCircle,
        tone: 'blue',
        titleKey: 'checkout.statusOverpaid',
        descriptionKey: 'checkout.statusOverpaidDescription',
      };
    case 'expired':
      return {
        Icon: XCircle,
        tone: 'red',
        titleKey: 'expired',
        descriptionKey: 'checkout.expiredDescription',
      };
    case 'failed':
      return {
        Icon: XCircle,
        tone: 'red',
        titleKey: 'failed',
        descriptionKey: 'checkout.failedDescription',
      };
    case 'awaiting':
    default:
      return {
        Icon: Loader2,
        tone: 'accent',
        titleKey: 'checkout.statusAwaiting',
        descriptionKey: 'checkout.statusAwaitingDescription',
        spin: true,
      };
  }
}

/**
 * Animated, accessible payment status indicator for the hosted checkout
 * (#1252). Renders a smooth awaiting -> confirming -> confirmed transition
 * with a checkmark pop, and announces every stage change to screen readers.
 */
export function PaymentStatusIndicator({
  stage,
  connectionType,
  shortfall,
  currency,
  className = '',
}: PaymentStatusIndicatorProps) {
  const t = useTranslations('payment');
  const visual = visualFor(stage);
  const { Icon } = visual;
  const isAccent = visual.tone === 'accent';

  const title = t(visual.titleKey);
  const description = t(visual.descriptionKey, {
    amount: shortfall ?? 0,
    currency: currency ?? '',
    paidAmount: shortfall ?? 0,
  });
  const announcement = t('checkout.statusAnnouncement', { status: title });

  const isLive = connectionType === 'websocket' || connectionType === 'sse';
  const isPolling = connectionType === 'polling';

  return (
    <div
      className={`flex flex-col items-center gap-3 text-center ${className}`.trim()}
    >
      <span className="relative inline-flex h-16 w-16 items-center justify-center">
        {visual.spin && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 animate-checkout-pulse-ring"
            style={isAccent ? accentRingStyle : undefined}
          />
        )}
        <span
          className={`flex h-16 w-16 items-center justify-center rounded-full border ${
            isAccent ? '' : TONE_WRAP[visual.tone]
          } ${visual.pop ? 'animate-checkout-pop' : ''}`}
          style={isAccent ? accentWrapStyle : undefined}
        >
          <Icon
            aria-hidden="true"
            className={`h-9 w-9 ${isAccent ? '' : TONE_ICON[visual.tone]} ${
              visual.spin ? 'animate-spin' : ''
            }`}
            style={isAccent ? accentIconStyle : undefined}
          />
        </span>
      </span>

      <div className="space-y-1">
        <p
          className={`text-base font-semibold ${isAccent ? '' : TONE_ICON[visual.tone]}`}
          style={isAccent ? accentIconStyle : undefined}
        >
          {title}
        </p>
        <p className="text-sm text-gray-600">{description}</p>
      </div>

      {(isLive || isPolling) && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              isLive ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
            }`}
          />
          {isPolling ? t('checkout.statusPolling') : t('checkout.statusUpdating')}
        </p>
      )}

      {/* Single polite live region announcing the current stage. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
