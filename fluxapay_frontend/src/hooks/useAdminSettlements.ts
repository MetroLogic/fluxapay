"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

export interface AdminSettlementRow {
  id: string;
  merchantId: string;
  merchantName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  fxRate: number;
  fees: { network: number; platform: number };
  bankReference?: string;
  bankName?: string;
  bankAccountNumber?: string;
  paymentsIncluded: { id: string; amount: number; date: string }[];
}

interface AdminSettlementsResponse {
  settlements: AdminSettlementRow[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

interface UseAdminSettlementsParams {
  page?: number;
  limit?: number;
  status?: string;
}

export function useAdminSettlements(params: UseAdminSettlementsParams = {}) {
  const key =
    params.page != null || params.limit != null || params.status
      ? ["admin-settlements", params]
      : "admin-settlements";

  const { data, error, isLoading, mutate } = useSWR<AdminSettlementsResponse>(
    key,
    async () => {
      try {
        return await api.admin.settlements.list(params) as AdminSettlementsResponse;
      } catch {
        return { settlements: [], pagination: { total: 0, page: 1, limit: 50, pages: 0 } };
      }
    }
  );

  return {
    settlements: data?.settlements ?? [],
    pagination: data?.pagination,
    error: error ?? null,
    isLoading,
    mutate,
  };
}
