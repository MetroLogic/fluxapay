"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

export interface FxRateResponse {
  rate: number;
  currency: string;
  base: string; // usually USDC
  updatedAt: string;
}

export function useFxRate(currency: string) {
  const { data, error, isLoading, mutate } = useSWR<FxRateResponse>(
    currency ? ["fx-rate", currency] : null,
    () => api.fx.getRate(currency) as Promise<FxRateResponse>,
    {
      refreshInterval: 60000, // Refresh every 60 seconds
      revalidateOnFocus: true,
    }
  );

  return {
    rateData: data,
    error,
    isLoading,
    mutate,
  };
}
