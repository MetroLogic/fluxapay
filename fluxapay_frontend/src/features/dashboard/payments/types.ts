export type PaymentStatus =
  | "pending"
  | "confirmed"
  | "expired"
  | "failed"
  | "partially_paid"
  | "overpaid"
  | "paid"
  | "completed";

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
}
