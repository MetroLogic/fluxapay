import { z } from "zod";

export const createRefundSchema = z.object({
  payment_id: z.string().min(1),
  amount: z.coerce.number().positive(),
  reason: z.string().max(500).optional(),
});

export const updateRefundStatusSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  failed_reason: z.string().max(500).optional(),
});

export const listRefundsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
});
