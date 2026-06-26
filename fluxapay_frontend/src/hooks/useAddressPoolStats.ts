"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

export interface AddressPoolStats {
  available: number;
  assigned: number;
  cooldown: number;
  total: number;
}

export function useAddressPoolStats() {
  const { data, error, isLoading, mutate } = useSWR<AddressPoolStats>(
    "admin-address-pool-stats",
    () => api.admin.addressPool.stats() as Promise<AddressPoolStats>,
    {
      refreshInterval: 30000, // Poll every 30 seconds
    }
  );

  return {
    stats: data,
    error,
    isLoading,
    mutate,
  };
}
