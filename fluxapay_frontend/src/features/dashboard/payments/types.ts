export type PaymentStatus =
  | "pending"
  | "confirmed"
  | "expired"
  | "failed"
  | "partially_paid"
  | "overpaid"
  | "paid"
  | "completed"
  | "settled"
  | "underpaid";

export interface WebhookLogEntry {
  id: string;
  event_type: string;
  endpoint_url: string;
  status: "success" | "failed" | "pending";
  http_status?: number;
  attempt: number;
  created_at: string;
  response_body?: string;
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
