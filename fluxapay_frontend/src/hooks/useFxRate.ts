"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

export interface FxRateResponse {
  rate: number;
  currency: string;
  base: string;
  updatedAt: string;
}

async function fetchFxRate(currency: string): Promise<FxRateResponse> {
  const raw = await api.fx.getRate(currency);
  if (!raw) {
    throw new Error("FX rate unavailable");
  }
  return {
    rate: raw.rate,
    currency: raw.base_currency,
    base: raw.target_currency,
    updatedAt: new Date().toISOString(),
  };
}

export function useFxRate(currency: string) {
  const { data, error, isLoading, mutate } = useSWR<FxRateResponse>(
    currency ? ["fx-rate", currency] : null,
    () => fetchFxRate(currency),
    {
      refreshInterval: 60000,
      revalidateOnFocus: true,
    },
  );

  return {
    rateData: data,
    error,
    isLoading,
    mutate,
  };
}
