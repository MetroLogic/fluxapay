"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

export interface AdminMerchant {
  id: string;
  businessName: string;
  email: string;
  kycStatus: "approved" | "pending_review" | "rejected" | "not_submitted";
  accountStatus: string;
  volume: number;
  revenue: number;
  dateJoined: string;
  transactionCount: number;
  avgTransaction: number;
}

interface AdminMerchantsResponse {
  merchants: AdminMerchant[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

interface UseAdminMerchantsParams {
  page?: number;
  limit?: number;
  kycStatus?: string;
  accountStatus?: string;
}

export function useAdminMerchants(params: UseAdminMerchantsParams = {}) {
  const key =
    params.page != null || params.limit != null || params.kycStatus || params.accountStatus
      ? ["admin-merchants", params]
      : "admin-merchants";

  const { data, error, isLoading, mutate } = useSWR<AdminMerchantsResponse>(
    key,
    async () => {
      try {
        return await api.admin.merchants.list(params) as AdminMerchantsResponse;
      } catch {
        return { merchants: [], pagination: { total: 0, page: 1, limit: 50, pages: 0 } };
      }
    }
  );

  return {
    merchants: data?.merchants ?? [],
    pagination: data?.pagination,
    error: error ?? null,
    isLoading,
    mutate,
  };
}
