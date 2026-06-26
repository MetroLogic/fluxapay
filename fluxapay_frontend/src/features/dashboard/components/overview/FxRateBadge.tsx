"use client";

import { useFxRate } from "@/hooks/useFxRate";
import { Coins, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function FxRateBadge({ currency }: { currency?: string }) {
  // If no currency is passed, we could read it from the user context. For now, default to NGN or USD.
  const targetCurrency = currency || "NGN"; 
  const { rateData, isLoading, error } = useFxRate(targetCurrency);

  if (error) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-500 text-xs font-medium border border-red-100">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Failed to load FX rate</span>
      </div>
    );
  }

  if (isLoading || !rateData) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border text-xs font-medium animate-pulse">
        <Coins className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="h-3 w-16 bg-muted-foreground/20 rounded"></div>
      </div>
    );
  }

  // Check if data is older than 5 minutes
  const lastUpdated = new Date(rateData.updatedAt || Date.now());
  const isStale = (Date.now() - lastUpdated.getTime()) > 5 * 60 * 1000;

  return (
    <div 
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 text-primary text-xs font-medium border border-primary/20 shadow-sm"
      title={isStale ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : "Live Rate"}
    >
      <Coins className="w-3.5 h-3.5" />
      <span>
        1 USDC = {rateData.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {rateData.currency}
      </span>
      {isStale && (
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-1" title="Rate may be delayed" />
      )}
      {!isStale && (
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" title="Live" />
      )}
    </div>
  );
}
