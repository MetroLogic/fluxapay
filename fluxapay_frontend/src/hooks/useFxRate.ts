"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

export interface FxRateResponse {
  rate: number;
  currency: string;
  timestamp: string;
}

export function useFxRate(currency: string) {
  const { data, error, isLoading } = useSWR<FxRateResponse>(
    currency ? ["fx-rate", currency] : null,
    () => api.fx.getRate(currency) as Promise<FxRateResponse>,
    { refreshInterval: 60_000 },
  );

  return {
    rate: data?.rate ?? null,
    currency: data?.currency ?? currency,
    timestamp: data?.timestamp ?? null,
    error,
    isLoading,
  };
}
