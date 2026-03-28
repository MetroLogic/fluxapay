import { z } from "zod";

export const createRefundSchema = z.object({
  payment_id: z.string().min(1, "Payment ID is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
  reason: z.string().max(500, "Reason cannot exceed 500 characters").optional(),
  idempotency_key: z.string().min(1, "Idempotency key is required").optional(),
});

export const updateRefundStatusSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  failed_reason: z
    .string()
    .max(500, "Failed reason cannot exceed 500 characters")
    .optional(),
});

export const listRefundsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
});
