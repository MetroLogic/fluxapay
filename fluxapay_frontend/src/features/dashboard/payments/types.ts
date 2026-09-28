/**
 * Payment status — aligned with backend Prisma PaymentStatus enum.
 */
export type PaymentStatus =
  | "pending"
  | "partially_paid"
  | "confirmed"
  | "overpaid"
  | "expired"
  | "failed"
  | "paid"
  | "completed"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export interface WebhookLogEntry {
  id: string;
  event_type: string;
  endpoint_url: string;
  status: "success" | "failed" | "pending";
  http_status?: number;
  attempt: number;
  created_at: string;
  response_body?: string;
  retry_count?: number;
  next_retry_at?: string;
}

export interface StatusHistoryEntry {
  status: PaymentStatus;
  timestamp: string;
  note?: string;
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  merchantId: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  orderId: string;
  createdAt: string;
  depositAddress: string;
  txHash?: string;
  sweepStatus?: string;
  settlementLinkage?: unknown;
  stellarExpertUrl?: string;
  checkoutUrl?: string;
  fiatEquivalent?: number;
  fiatCurrency?: string;
  webhookLogs?: WebhookLogEntry[];
  statusHistory?: StatusHistoryEntry[];
}
