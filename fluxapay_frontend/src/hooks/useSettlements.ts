"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

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

/* ------------------------------------------------------------------ */
/*  Single settlement detail (fetched from GET /api/v1/settlements/:id) */
/* ------------------------------------------------------------------ */

export interface SettlementDetailPayment {
  id: string;
  amount: number;
  currency: string;
  customer_email: string;
  status: string;
  createdAt: string;
}

export interface SettlementDetail {
  id: string;
  merchantId: string;
  usdc_amount: number;
  amount: number;
  fees: number;
  net_amount: number;
  currency: string;
  status: "completed" | "pending" | "processing" | "failed";
  exchange_partner: string | null;
  exchange_rate: number | null;
  exchange_ref: string | null;
  bank_transfer_id: string | null;
  payment_ids: string[] | null;
  failure_reason: string | null;
  scheduled_date: string;
  processed_date: string | null;
  created_at: string;
  updated_at: string;
  payments: SettlementDetailPayment[];
  merchant?: { business_name: string };
}

export function useSettlementDetails(settlementId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<SettlementDetail>(
    settlementId ? ["settlement-detail", settlementId] : null,
    () => api.settlements.getById(settlementId!) as Promise<SettlementDetail>,
  );
  return { detail: data ?? null, error, isLoading, mutate };
}

/* ------------------------------------------------------------------ */
/*  Download settlement report (CSV / PDF) via backend export endpoint */
/* ------------------------------------------------------------------ */

export function useSettlementExport() {
  const [exporting, setExporting] = useState(false);

  const download = useCallback(
    async (settlementId: string, format: "csv" | "pdf") => {
      setExporting(true);
      try {
        const result = await api.settlements.export(settlementId, format);

        // Backend returns { filename, content, contentType }
        const filename =
          (result as { filename?: string }).filename ??
          `settlement-${settlementId}.${format}`;
        const content = (result as { content?: unknown }).content;

        let blob: Blob;
        if (format === "csv" && typeof content === "string") {
          blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        } else {
          // PDF data returned as JSON — stringify for download
          const jsonStr =
            typeof content === "string" ? content : JSON.stringify(content, null, 2);
          blob = new Blob([jsonStr], { type: "application/json" });
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(`${format.toUpperCase()} downloaded`);
      } catch {
        toast.error(`Failed to download ${format.toUpperCase()}`);
      } finally {
        setExporting(false);
      }
    },
    [],
  );

  return { download, exporting };
}
