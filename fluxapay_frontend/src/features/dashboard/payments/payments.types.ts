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
