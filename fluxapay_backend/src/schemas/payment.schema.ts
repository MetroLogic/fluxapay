import { z } from "zod";

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(10).optional(),
  status: z
    .enum(["pending", "completed", "failed", "cancelled"])
    .optional(),
  currency: z.string().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  amount_min: z.coerce.number().nonnegative().optional(),
  amount_max: z.coerce.number().nonnegative().optional(),
  search: z.string().min(1).optional(),
  sort_by: z.enum(["date", "amount", "status"]).default("date").optional(),
  order: z.enum(["asc", "desc"]).default("desc").optional(),
});

export const exportPaymentsQuerySchema = z.object({
  status: z
    .enum(["pending", "completed", "failed", "cancelled"])
    .optional(),
  currency: z.string().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  amount_min: z.coerce.number().nonnegative().optional(),
  amount_max: z.coerce.number().nonnegative().optional(),
  search: z.string().min(1).optional(),
  format: z.enum(["csv"]).default("csv").optional(),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type ExportPaymentsQuery = z.infer<typeof exportPaymentsQuerySchema>;
