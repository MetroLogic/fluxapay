"use client";

import { useMemo } from "react";
import { Info, AlertCircle, RefreshCw } from "lucide-react";
import { useFxRate } from "@/hooks/useFxRate";

// ─── Fee constants ──────────────────────────────────────────────────────────
/** Fluxapay platform fee: 1.5% of the gross amount */
export const PLATFORM_FEE_RATE = 0.015;

/** Stellar network fee: ~0.00001 XLM per operation, expressed in USDC equivalent */
export const STELLAR_NETWORK_FEE_USDC = 0.0001;

/** Supported fiat currencies – extend as coverage grows */
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "NGN", "KES", "GHS"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// ─── Pure fee calculation (exported for unit testing) ────────────────────────
export interface FeeBreakdown {
  /** The gross amount the customer sends in USDC */
  grossUsdc: number;
  /** Platform fee in USDC */
  platformFeeUsdc: number;
  /** Stellar network fee in USDC */
  networkFeeUsdc: number;
  /** Total fees in USDC */
  totalFeesUsdc: number;
  /** Net USDC after all fees */
  netUsdc: number;
  /** Approximate fiat settlement using live FX rate */
  estimatedFiatPayout: number | null;
  /** The FX rate used (USDC → fiat) */
  fxRate: number | null;
  /** Fiat currency code */
  currency: string;
}

/**
 * Pure calculation – no React, fully unit-testable.
 *
 * @param amount - The link amount in fiat / USDC (same value; USDC is the payment rail)
 * @param currency - The merchant's selected fiat currency
 * @param fxRate  - Live USDC-to-fiat exchange rate (null when unavailable)
 */
export function calculateFeeBreakdown(
  amount: number,
  currency: string,
  fxRate: number | null,
): FeeBreakdown {
  const grossUsdc = Math.max(0, amount);
  const platformFeeUsdc = grossUsdc * PLATFORM_FEE_RATE;
  const networkFeeUsdc = STELLAR_NETWORK_FEE_USDC;
  const totalFeesUsdc = platformFeeUsdc + networkFeeUsdc;
  const netUsdc = Math.max(0, grossUsdc - totalFeesUsdc);
  const estimatedFiatPayout = fxRate !== null ? netUsdc * fxRate : null;

  return {
    grossUsdc,
    platformFeeUsdc,
    networkFeeUsdc,
    totalFeesUsdc,
    netUsdc,
    estimatedFiatPayout,
    fxRate,
    currency,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────
interface FeeBreakdownPreviewProps {
  /** Raw string from the amount input field */
  amountRaw: string;
  /** Currently selected fiat currency */
  currency: string;
}

function Row({
  label,
  value,
  bold,
  dimmed,
  redValue,
  tooltip,
}: {
  label: string;
  value: string;
  bold?: boolean;
  dimmed?: boolean;
  redValue?: boolean;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span
        className={`flex items-center gap-1 ${
          dimmed ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {label}
        {tooltip && (
          <span title={tooltip} aria-label={tooltip} className="cursor-help">
            <Info className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
      </span>
      <span
        className={`tabular-nums ${bold ? "font-semibold" : ""} ${
          redValue ? "text-destructive" : dimmed ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function FeeBreakdownPreview({
  amountRaw,
  currency,
}: FeeBreakdownPreviewProps) {
  const amount = parseFloat(amountRaw);
  const isValidAmount = !isNaN(amount) && amount > 0;

  const { rateData, isLoading: fxLoading, error: fxError, mutate } = useFxRate(
    isValidAmount ? currency : "",
  );

  const fxRate = rateData?.rate ?? null;

  const breakdown = useMemo(
    () =>
      isValidAmount
        ? calculateFeeBreakdown(amount, currency, fxRate)
        : null,
    [amount, currency, fxRate, isValidAmount],
  );

  if (!isValidAmount) return null;

  const fmt = (n: number, decimals = 2) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  const fmtFiat = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <div
      className="rounded-lg border border-border bg-muted/30 p-4 space-y-1"
      aria-label="Fee breakdown preview"
      data-testid="fee-breakdown-preview"
    >
      {/* Header */}
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Fee Breakdown Preview
      </p>

      <div className="divide-y divide-border/60">
        <div className="pb-2 space-y-0.5">
          <Row
            label="Gross Amount"
            value={`${fmt(breakdown!.grossUsdc)} USDC`}
          />
          <Row
            label="Platform Fee (1.5%)"
            value={`− ${fmt(breakdown!.platformFeeUsdc, 4)} USDC`}
            dimmed
            redValue
            tooltip="Fluxapay charges a 1.5% platform fee on the gross amount."
          />
          <Row
            label="Stellar Network Fee"
            value={`− ${fmt(breakdown!.networkFeeUsdc, 4)} USDC`}
            dimmed
            redValue
            tooltip="Estimated Stellar transaction fee (~0.0001 USDC equivalent)."
          />
        </div>

        <div className="pt-2">
          <Row
            label="Net USDC (after fees)"
            value={`${fmt(breakdown!.netUsdc)} USDC`}
            bold
          />
        </div>
      </div>

      {/* FX settlement estimate */}
      <div className="mt-3 rounded-md bg-primary/5 border border-primary/20 px-3 py-2.5">
        <p className="text-xs text-muted-foreground mb-1">
          Estimated Fiat Settlement
        </p>

        {fxLoading ? (
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <span className="text-xs text-muted-foreground">Loading rate…</span>
          </div>
        ) : fxError ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>FX rate unavailable — settlement estimate not shown.</span>
            <button
              type="button"
              onClick={() => void mutate()}
              className="ml-1 underline hover:no-underline"
              aria-label="Retry loading FX rate"
            >
              <RefreshCw className="h-3 w-3 inline" aria-hidden="true" /> Retry
            </button>
          </div>
        ) : breakdown?.estimatedFiatPayout !== null ? (
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="text-lg font-bold text-primary"
              data-testid="estimated-fiat-payout"
            >
              ≈ {fmtFiat(breakdown!.estimatedFiatPayout!)}
            </span>
            <span className="text-xs text-muted-foreground">
              @ 1 USDC ={" "}
              {fxRate?.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              })}{" "}
              {currency}
            </span>
          </div>
        ) : null}
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground pt-1">
        * Estimates only. Final settlement may vary based on FX rate at time of
        processing.
      </p>
    </div>
  );
}
