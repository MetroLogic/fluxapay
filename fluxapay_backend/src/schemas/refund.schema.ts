import { z } from "zod";

export const initiateRefundSchema = z.object({
  paymentId: z.string().min(1, "Payment ID is required"),
  merchantId: z.string().min(1, "Merchant ID is required"),
  amount: z.number().positive("Amount must be positive"),
  currency: z.enum(["USDC", "XLM"], {
    message: "Currency must be USDC or XLM",
  }),
  customerAddress: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar address format"),
  reason: z.enum([
    "customer_request",
    "duplicate_payment",
    "failed_delivery",
    "merchant_request",
    "dispute_resolution",
  ]),
  reasonNote: z.string().optional(),
});

export const listRefundsSchema = z.object({
  paymentId: z.string().optional(),
  merchantId: z.string().optional(),
  status: z
    .enum(["initiated", "processing", "completed", "failed"])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
