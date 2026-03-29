import { z } from "zod";

export const createCustomerSchema = z.object({
  email: z.string().email(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

export const customerIdParamsSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const updateCustomerSchema = z
  .object({
    params: z.object({ id: z.string().min(1) }),
    email: z.string().email().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => d.email !== undefined || d.metadata !== undefined, {
    message: "Provide at least one of email or metadata",
  });
