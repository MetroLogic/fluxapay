import { z } from "zod";

export const createPaymentLinkSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3),
  redirect_url: z.string().url().optional(),
  expiry: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  customer_id: z.string().optional(),
}).refine((data) => {
  if (data.metadata && Object.keys(data.metadata).length > 10) {
    return false;
  }
  return true;
}, { message: "Metadata cannot exceed 10 key-value pairs" });

export const updatePaymentLinkSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  redirect_url: z.string().url().optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((data) => {
  if (data.metadata && Object.keys(data.metadata).length > 10) {
    return false;
  }
  return true;
}, { message: "Metadata cannot exceed 10 key-value pairs" });

export const paymentLinkParamsSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listPaymentLinksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  active: z.coerce.boolean().optional(),
});
