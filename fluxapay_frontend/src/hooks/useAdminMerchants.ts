import useSWR from "swr";
import { api } from "@/lib/api";

export interface AdminMerchant {
  id: string;
  businessName: string;
  email: string;
  kycStatus: "unverified" | "pending" | "pending_review" | "approved" | "rejected";
  accountStatus: string;
  volume: number;
  revenue: number;
  transactionCount: number;
  avgTransaction: number;
  dateJoined: string;
}

function normaliseMerchant(raw: Record<string, unknown>): AdminMerchant {
  const volume = Number(raw.total_volume ?? raw.volume ?? 0);
  const revenue = Number(raw.total_revenue ?? raw.revenue ?? 0);
  const txCount = Number(raw.transaction_count ?? raw.transactionCount ?? 0);

  return {
    id: String(raw.id ?? raw._id ?? ""),
    businessName: String(raw.business_name ?? raw.businessName ?? ""),
    email: String(raw.email ?? ""),
    kycStatus: (raw.kyc_status ?? raw.kycStatus ?? "unverified") as AdminMerchant["kycStatus"],
    accountStatus: String(raw.account_status ?? raw.accountStatus ?? raw.status ?? "active"),
    volume,
    revenue,
    transactionCount: txCount,
    avgTransaction: txCount > 0 ? volume / txCount : 0,
    dateJoined: raw.created_at
      ? new Date(raw.created_at as string).toLocaleDateString()
      : raw.dateJoined
        ? String(raw.dateJoined)
        : "—",
  };
}

interface UseAdminMerchantsParams {
  page?: number;
  limit?: number;
  kycStatus?: string;
  accountStatus?: string;
}

interface UseAdminMerchantsResult {
  merchants: AdminMerchant[];
  isLoading: boolean;
  error: unknown;
  mutate: () => void;
}

export function useAdminMerchants(
  params: UseAdminMerchantsParams = {},
): UseAdminMerchantsResult {
  const key = [
    "admin-merchants",
    params.page,
    params.limit,
    params.kycStatus,
    params.accountStatus,
  ];

  const { data, error, isLoading, mutate } = useSWR(
    key,
    async () => {
      const res = await api.admin.merchants.list(params);
      return res;
    },
    { revalidateOnFocus: false },
  );

  const raw: Record<string, unknown>[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.merchants)
      ? data.merchants
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return {
    merchants: raw.map(normaliseMerchant),
    isLoading,
    error,
    mutate,
  };
}
