import { notFound } from "next/navigation";
import type { Payment } from "@/features/dashboard/payments/types";

export interface BackendPayment {
  id: string;
  amount: number;
  currency: string;
  status: Payment["status"];
  merchantId: string;
  customer_email: string;
  order_id?: string;
  createdAt: string;
  depositAddress?: string;
  transaction_hash?: string;
  sweep_status?: string;
  settlement_linkage?: unknown;
  stellar_expert_url?: string;
}

export function mapBackendPayment(p: BackendPayment | null | undefined): Payment {
  if (!p) {
    notFound();
  }

  return {
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    merchantId: p.merchantId,
    customerName: "",
    customerEmail: p.customer_email ?? "",
    customerAddress: "",
    orderId: p.order_id ?? "",
    createdAt: p.createdAt,
    depositAddress: p.depositAddress ?? "",
    txHash: p.transaction_hash,
    sweepStatus: p.sweep_status,
    settlementLinkage: p.settlement_linkage,
    stellarExpertUrl: p.stellar_expert_url,
  };
}
