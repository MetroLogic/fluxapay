export type RefundStatus = "initiated" | "processing" | "completed" | "failed";

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

export const MOCK_REFUNDS: RefundRecord[] = [
  {
    id: "ref_1001",
    paymentId: "pay_7f2a1b3c4d",
    merchantId: "merch_demo_001",
    amount: 150,
    currency: "USDC",
    customerAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    reason: "customer_request",
    status: "completed",
    stellarTxHash: "9f8a2f1f5d8b4c71a9e2abf0a998741f",
    createdAt: "2026-01-25T11:30:00Z",
  },
  {
    id: "ref_1002",
    paymentId: "pay_q8w7e6r5t4",
    merchantId: "merch_demo_001",
    amount: 100.5,
    currency: "XLM",
    customerAddress: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    reason: "merchant_request",
    reasonNote: "Duplicate invoice issue",
    status: "processing",
    createdAt: "2026-01-24T15:10:00Z",
  },
  {
    id: "ref_1003",
    paymentId: "pay_z1x2c3v4b5",
    merchantId: "merch_demo_002",
    amount: 30,
    currency: "USDC",
    customerAddress: "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    reason: "failed_delivery",
    status: "failed",
    createdAt: "2026-01-23T09:20:00Z",
  },
];
