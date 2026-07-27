export type RefundStatus = "pending" | "processing" | "completed" | "failed";

export type RefundReason =
  | "customer_request"
  | "duplicate_payment"
  | "failed_delivery"
  | "merchant_request"
  | "dispute_resolution";

export interface RefundRecord {
  id: string;
  paymentId: string;
  merchantId: string;
  amount: number;
  currency: "USDC" | "XLM";
  customerAddress: string;
  reason: RefundReason;
  reasonNote?: string;
  status: RefundStatus;
  stellarTxHash?: string;
  createdAt: string;
}
