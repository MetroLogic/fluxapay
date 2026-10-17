"use client";

import useSWR from "swr";
import { api, type DashboardFxRate } from "@/lib/api";

async function fetchDashboardFxRates(forceRefresh = false): Promise<DashboardFxRate[]> {
  const result = await api.fx.getDashboardRates(forceRefresh);
  if ("error" in result) throw result.error;
  return result.data.data.rates;
}

export function useDashboardFxRates() {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    "dashboard-fx-rates",
    () => fetchDashboardFxRates(),
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    },
  );

  return {
    rates: data,
    error,
    isLoading,
    isRefreshing: isValidating,
    refresh: () => mutate(() => fetchDashboardFxRates(true), { revalidate: false }),
  };
}