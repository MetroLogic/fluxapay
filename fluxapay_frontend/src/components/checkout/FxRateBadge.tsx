"use client";

import { useFxRate } from "@/hooks/useFxRate";
import { Loader2, AlertCircle } from "lucide-react";

interface FxRateBadgeProps {
  currency?: string;
  className?: string;
}

export function FxRateBadge({ currency = "USD", className = "" }: FxRateBadgeProps) {
  const { rate, timestamp, error, isLoading } = useFxRate(currency);

  const lastUpdated = timestamp
    ? new Date(timestamp).toLocaleTimeString()
    : null;

  const isStale =
    timestamp && Date.now() - new Date(timestamp).getTime() > 5 * 60 * 1000;

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-gray-400 ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        <span>Loading rate…</span>
      </div>
    );
  }

  if (error || !rate) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-amber-600 ${className}`}>
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        <span>Rate unavailable</span>
      </div>
    );
  }

  return (
    <div className={`text-xs text-gray-500 ${className}`}>
      <span>
        1 USDC = {rate} {currency}
      </span>
      {lastUpdated && (
        <span className="ml-2 text-gray-400">
          • Updated {lastUpdated}
          {isStale && " • Stale"}
        </span>
      )}
    </div>
  );
}
