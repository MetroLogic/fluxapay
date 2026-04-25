import { z } from "zod";

export const createInvoiceSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.string().min(3).max(10),
  customer_email: z.string().email(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  due_date: z.string().datetime().optional(),
});

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(["pending", "paid", "cancelled", "overdue"]).optional(),
  /** Search invoice number or customer email (case-insensitive) */
  search: z.string().trim().max(200).optional(),
});

export const exportInvoiceSchema = z.object({
  params: z.object({
    invoice_id: z.string(),
  }),
  query: z.object({
    format: z.enum(["csv", "json"]).default("json"),
  }),
});
