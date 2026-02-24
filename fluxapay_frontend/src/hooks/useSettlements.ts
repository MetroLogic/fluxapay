"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

/** Shape used by merchant dashboard SettlementsPage / SettlementsTable. */
export interface MerchantSettlement {
  id: string;
  date: string;
  paymentsCount: number;
  usdcAmount: number;
  fiatAmount: number;
  currency: string;
  status: "completed" | "pending" | "failed";
  bankReference: string;
  conversionRate: number;
  fees: number;
  payments: { id: string; amount: number; customer: string }[];
}

interface BackendSettlementRow {
  id: string;
  created_at: string;
  amount: unknown;
  currency: string;
  status: string;
  fees: unknown;
  usdc_amount?: unknown;
  exchange_rate?: unknown;
  exchange_ref?: string;
  payment_ids?: unknown;
}

interface MerchantSettlementsResponse {
  settlements: BackendSettlementRow[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

function mapSettlement(row: BackendSettlementRow): MerchantSettlement {
  const paymentIds = Array.isArray(row.payment_ids) ? row.payment_ids : [];
  return {
    id: row.id,
    date: row.created_at?.slice(0, 10) ?? "",
    paymentsCount: paymentIds.length,
    usdcAmount: Number(row.usdc_amount ?? row.amount ?? 0),
    fiatAmount: Number(row.amount ?? 0),
    currency: row.currency ?? "USD",
    status: (row.status === "completed" || row.status === "pending" || row.status === "failed"
      ? row.status
      : "pending") as "completed" | "pending" | "failed",
    bankReference: row.exchange_ref ?? "",
    conversionRate: Number(row.exchange_rate ?? 1),
    fees: Number(row.fees ?? 0),
    payments: [],
  };
}

interface UseSettlementsParams {
  page?: number;
  limit?: number;
  status?: string;
  currency?: string;
  date_from?: string;
  date_to?: string;
}

export function useSettlements(params: UseSettlementsParams = {}) {
  const key =
    params.page != null ||
    params.limit != null ||
    params.status ||
    params.currency ||
    params.date_from ||
    params.date_to
      ? ["merchant-settlements", params]
      : "merchant-settlements";

  const { data, error, isLoading, mutate } = useSWR<MerchantSettlementsResponse>(
    key,
    () => api.settlements.list(params) as Promise<MerchantSettlementsResponse>
  );

  const settlements: MerchantSettlement[] = (data?.settlements ?? []).map(mapSettlement);

  return {
    settlements,
    pagination: data?.pagination,
    error,
    isLoading,
    mutate,
  };
}

export interface SettlementSummary {
  total_settled_this_month: number;
  total_fees_paid: number;
  average_settlement_time_days: number;
  next_settlement_date: string;
}

export function useSettlementSummary() {
  const { data, error, isLoading, mutate } = useSWR<SettlementSummary>(
    "merchant-settlement-summary",
    () => api.settlements.summary() as Promise<SettlementSummary>
  );
  return {
    summary: data,
    error,
    isLoading,
    mutate,
  };
}
