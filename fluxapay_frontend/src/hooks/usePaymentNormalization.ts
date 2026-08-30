'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Payment, PaymentStatus } from '@/types/payment';

/**
 * Payment statuses after which no further live updates are expected. Once a
 * payment reaches one of these states we stop polling / listening on SSE.
 * Defined in a single place so every consumer (SSE, polling, terminal-state
 * detection) relies on the same source of truth.
 */
export const TERMINAL_STATUSES = [
  'confirmed',
  'expired',
  'failed',
  'partially_paid',
  'overpaid',
] as const;

/** True when `status` is a terminal state (no further live updates expected). */
export function isTerminalStatus(status: PaymentStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

const PAYMENT_STATUSES = [
  'pending',
  'partially_paid',
  'confirmed',
  'overpaid',
  'expired',
  'failed',
  'paid',
  'completed',
  'cancelled',
  'refunded',
  'partially_refunded',
] as const satisfies readonly PaymentStatus[];

/**
 * Validates only the fields `normalizePaymentResponse` cannot safely default
 * or derive — everything the rest of the app treats as required on a
 * `Payment`. Extra/branding fields are handled separately below and are
 * intentionally not part of this schema (`.passthrough()` lets them through
 * untouched).
 */
const RequiredPaymentFieldsSchema = z
  .object({
    id: z.string().min(1, 'id is required'),
    amount: z.number({ invalid_type_error: 'amount must be a number' }),
    currency: z.string().min(1, 'currency is required'),
    address: z.string().min(1, 'address is required'),
    status: z.enum(PAYMENT_STATUSES),
    expiresAt: z.string().min(1, 'expiresAt is required'),
  })
  .passthrough();

/**
 * Thrown by `normalizePaymentResponse` when the raw API response is missing
 * (or has the wrong type for) a field the rest of the app requires on a
 * `Payment`. Carries field-level details so callers can surface a specific
 * message instead of an unhandled crash.
 */
export class PaymentParseError extends Error {
  public readonly fieldErrors: Record<string, string[] | undefined>;

  constructor(fieldErrors: Record<string, string[] | undefined>) {
    const fields = Object.keys(fieldErrors).join(', ');
    super(`Payment response is missing or has invalid required field(s): ${fields}`);
    this.name = 'PaymentParseError';
    this.fieldErrors = fieldErrors;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function normalizeHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const color = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^[0-9a-fA-F]{6}$/.test(color)) return `#${color}`;
  return color;
}

/** Validates a raw API payment payload into a normalized `Payment`. */
export function normalizePaymentResponse(data: unknown): Payment {
  const raw = asRecord(data);
  const merchantBranding = asRecord(raw.merchant_branding ?? raw.merchantBranding);

  const parsed = RequiredPaymentFieldsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PaymentParseError(parsed.error.flatten().fieldErrors);
  }

  const expiresAtDate = new Date(parsed.data.expiresAt);
  if (Number.isNaN(expiresAtDate.getTime())) {
    throw new PaymentParseError({ expiresAt: ['expiresAt is not a valid date'] });
  }

  return {
    ...(parsed.data as unknown as Payment),
    expiresAt: expiresAtDate,
    merchantName: firstString(
      raw.merchantName,
      raw.merchant_name,
      merchantBranding.businessName,
      merchantBranding.business_name,
      merchantBranding.merchantName,
      merchantBranding.merchant_name
    ),
    checkoutLogoUrl: firstString(
      raw.checkoutLogoUrl,
      raw.checkout_logo_url,
      merchantBranding.logoUrl,
      merchantBranding.logo_url,
      merchantBranding.checkoutLogoUrl,
      merchantBranding.checkout_logo_url
    ),
    checkoutAccentColor: normalizeHexColor(firstString(
      raw.checkoutAccentColor,
      raw.checkout_accent_color,
      merchantBranding.primaryColor,
      merchantBranding.primary_color,
      merchantBranding.brandColor,
      merchantBranding.brand_color,
      merchantBranding.accentColor,
      merchantBranding.accent_color,
      merchantBranding.checkoutAccentColor,
      merchantBranding.checkout_accent_color
    )),
    paidAmount:
      (raw.paidAmount as number | undefined) ??
      (raw.paid_amount as number | undefined),
    supportUrl:
      (raw.supportUrl as string | undefined) ??
      (raw.support_url as string | undefined),
    transactionHash:
      (raw.transactionHash as string | undefined) ??
      (raw.transaction_hash as string | undefined),
  };
}

/** A partial status update delivered over SSE or polling. */
export interface PaymentUpdate {
  status?: PaymentStatus;
  paidAmount?: number;
  address?: string;
}

export interface UsePaymentNormalizationReturn {
  payment: Payment | null;
  paymentRef: React.MutableRefObject<Payment | null>;
  setPayment: React.Dispatch<React.SetStateAction<Payment | null>>;
  /** Merge a partial status update into the current payment. */
  applyPaymentUpdate: (data: PaymentUpdate) => void;
  depositAddressUpdated: boolean;
  setDepositAddressUpdated: (value: boolean) => void;
}

/**
 * Owns the normalized payment state plus the on-the-fly status update merges
 * used by both the polling and SSE paths (single responsibility: normalization
 * and payment-state management).
 */
export function usePaymentNormalization(): UsePaymentNormalizationReturn {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [depositAddressUpdated, setDepositAddressUpdated] = useState(false);
  const paymentRef = useRef<Payment | null>(null);

  // Keep paymentRef in sync
  useEffect(() => {
    paymentRef.current = payment;
  }, [payment]);

  const applyPaymentUpdate = useCallback((data: PaymentUpdate) => {
    setPayment((prev) => {
      if (!prev) return prev;
      const statusChanged = prev.status !== data.status;
      const paidAmountChanged =
        data.paidAmount !== undefined && prev.paidAmount !== data.paidAmount;
      const addressChanged =
        data.address !== undefined &&
        typeof data.address === 'string' &&
        data.address !== '' &&
        prev.address !== data.address;
      if (statusChanged || paidAmountChanged || addressChanged) {
        if (addressChanged) {
          setDepositAddressUpdated(true);
        }
        return {
          ...prev,
          status: data.status,
          ...(data.paidAmount !== undefined ? { paidAmount: data.paidAmount } : {}),
          ...(addressChanged ? { address: data.address as string } : {}),
        };
      }
      return prev;
    });
  }, []);

  return {
    payment,
    paymentRef,
    setPayment,
    applyPaymentUpdate,
    depositAddressUpdated,
    setDepositAddressUpdated,
  };
}
