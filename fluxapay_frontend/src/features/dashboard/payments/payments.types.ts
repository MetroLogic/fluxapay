export type PaymentStatus =
  | "pending"
  | "confirmed"
  | "expired"
  | "failed";

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl?: string;
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
