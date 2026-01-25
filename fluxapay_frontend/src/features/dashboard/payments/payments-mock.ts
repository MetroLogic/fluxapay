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
  customerName: string;
  customerEmail: string;
  orderId: string;
  createdAt: string;
  depositAddress: string;
  txHash?: string;
}

export const MOCK_PAYMENTS: Payment[] = [
  {
    id: "pay_7f2a1b3c4d",
    amount: 150.0,
    currency: "USDC",
    status: "confirmed",
    customerName: "John Doe",
    customerEmail: "john@example.com",
    orderId: "ORD-9921",
    createdAt: "2026-01-24T10:30:00Z",
    depositAddress: "GBX...W4Q",
    txHash: "0x123...abc",
  },
  {
    id: "pay_9a8b7c6d5e",
    amount: 45.5,
    currency: "XLM",
    status: "pending",
    customerName: "Alice Smith",
    customerEmail: "alice@company.com",
    orderId: "ORD-9922",
    createdAt: "2026-01-24T09:15:00Z",
    depositAddress: "GC2...P9L",
  },
  {
    id: "pay_1x2y3z4w5v",
    amount: 1200.0,
    currency: "USDC",
    status: "failed",
    customerName: "Bob Richards",
    customerEmail: "bob@richards.io",
    orderId: "ORD-9923",
    createdAt: "2026-01-23T18:45:00Z",
    depositAddress: "GDU...K2M",
  },
  {
    id: "pay_5a6b7c8d9e",
    amount: 89.99,
    currency: "EURC",
    status: "confirmed",
    customerName: "Sarah Connor",
    customerEmail: "sarah@resistance.net",
    orderId: "ORD-9924",
    createdAt: "2026-01-23T14:20:00Z",
    depositAddress: "GAV...N6X",
    txHash: "0x456...def",
  },
  {
    id: "pay_m1n2o3p4q5",
    amount: 10.0,
    currency: "USDC",
    status: "expired",
    customerName: "Charlie Brown",
    customerEmail: "charlie@peanuts.com",
    orderId: "ORD-9925",
    createdAt: "2026-01-22T11:05:00Z",
    depositAddress: "GCT...B5V",
  },
  {
    id: "pay_q8w7e6r5t4",
    amount: 300.75,
    currency: "XLM",
    status: "confirmed",
    customerName: "Diana Prince",
    customerEmail: "diana@themyscira.com",
    orderId: "ORD-9926",
    createdAt: "2026-01-21T16:40:00Z",
    depositAddress: "GBS...D1S",
    txHash: "0x789...ghi",
  },
  {
    id: "pay_z1x2c3v4b5",
    amount: 55.0,
    currency: "USDC",
    status: "confirmed",
    customerName: "Peter Parker",
    customerEmail: "peter@dailybugle.com",
    orderId: "ORD-9927",
    createdAt: "2026-01-20T10:15:00Z",
    depositAddress: "GCD...A7F",
    txHash: "0xabc...123",
  },
];
