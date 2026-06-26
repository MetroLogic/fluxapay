"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import { Payment, PaymentStatus, PaymentEvent } from "@/features/admin/payments/types";

interface AdminPaymentsResponse {
  data: any[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

interface UseAdminPaymentsParams {
  page?: number;
  limit?: number;
  status?: string;
  currency?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

function mapBackendPayment(p: any): Payment {
  const events: PaymentEvent[] = [];

  if (p.createdAt) {
    events.push({
      id: `${p.id}-evt-created`,
      timestamp: p.createdAt,
      title: "Payment Initiated",
      description: "Customer initiated payment session",
      type: "off-chain",
    });
  }

  if (p.confirmed_at) {
    events.push({
      id: `${p.id}-evt-confirmed`,
      timestamp: p.confirmed_at,
      title: "Blockchain Transaction Detected",
      description: "Transaction seen and confirmed in mempool",
      type: "on-chain",
      txHash: p.transaction_hash || undefined,
    });
  }

  if (p.swept_at) {
    events.push({
      id: `${p.id}-evt-swept`,
      timestamp: p.swept_at,
      title: "Funds Swept",
      description: "Payment swept to system hot wallet",
      type: "system",
      txHash: p.sweep_tx_hash || undefined,
    });
  }

  if (p.settled_at) {
    events.push({
      id: `${p.id}-evt-settled`,
      timestamp: p.settled_at,
      title: "Settled",
      description: "Payment successfully settled to merchant bank account",
      type: "system",
    });
  } else if (p.status === "failed") {
    events.push({
      id: `${p.id}-evt-failed`,
      timestamp: p.updatedAt || p.createdAt,
      title: "Payment Failed",
      description: p.verification_error || "Payment session failed or timed out",
      type: "system",
    });
  }

  // Sort events chronologically
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    id: p.id,
    merchantId: p.merchantId,
    merchantName: p.merchant?.business_name || "—",
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status as PaymentStatus,
    networkTxHash: p.transaction_hash || undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt || p.createdAt,
    settlementId: p.settlementId || undefined,
    events,
  };
}

export function useAdminPayments(params: UseAdminPaymentsParams = {}) {
  const key =
    params.page != null ||
    params.limit != null ||
    params.status ||
    params.currency ||
    params.search ||
    params.date_from ||
    params.date_to
      ? ["admin-payments", params]
      : "admin-payments";

  const { data, error, isLoading, mutate } = useSWR<AdminPaymentsResponse>(
    key,
    async () => {
      return (await api.admin.payments.list(params)) as AdminPaymentsResponse;
    }
  );

  const payments = (data?.data ?? []).map(mapBackendPayment);

  return {
    payments,
    meta: data?.meta ?? { total: 0, page: 1, limit: 20 },
    error: error ?? null,
    isLoading,
    mutate,
  };
}
