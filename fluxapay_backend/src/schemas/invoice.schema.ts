import { z } from "zod";

export const createInvoiceSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  currency: z.string().min(3).max(10),
  customer_email: z.string().email(),
  customer_name: z.string().min(1).optional(),
  line_items: z.array(z.object({
    description: z.string(),
    quantity: z.coerce.number().positive(),
    unit_price: z.coerce.number().positive(),
  })).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  due_date: z.string().datetime().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
});

export const updateInvoiceStatusSchema = z.object({
  params: z.object({
    invoice_id: z.string(),
  }),
  body: z.object({
    status: z.enum(["draft", "sent", "paid", "overdue", "voided"]),
  }),
});

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(["draft", "sent", "paid", "overdue", "voided"]).optional(),
  /** Search invoice number or customer email (case-insensitive) */
  search: z.string().trim().max(200).optional(),
});

export const getInvoiceByIdSchema = z.object({
  params: z.object({
    invoice_id: z.string().min(1),
  }),
});

export const exportInvoiceSchema = z.object({
  params: z.object({
    invoice_id: z.string().min(1),
  }),
  query: z.object({
    format: z.enum(["csv", "json", "pdf"]).default("pdf"),
  }),
});
