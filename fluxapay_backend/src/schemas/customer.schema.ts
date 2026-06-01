import { z } from "zod";

export const createCustomerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().optional(),
  stellar_address: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((data) => {
  if (data.metadata && Object.keys(data.metadata).length > 10) {
    return false;
  }
  return true;
}, { message: "Metadata cannot exceed 10 key-value pairs" });

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  created_after: z.string().datetime().optional(),
  created_before: z.string().datetime().optional(),
});

export const customerIdParamsSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const updateCustomerSchema = z
  .object({
    params: z.object({ id: z.string().min(1) }),
    email: z.string().email().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    stellar_address: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (d) =>
      d.email !== undefined ||
      d.name !== undefined ||
      d.phone !== undefined ||
      d.stellar_address !== undefined ||
      d.metadata !== undefined,
    {
      message: "Provide at least one field to update",
    },
  )
  .refine((data) => {
    if (data.metadata && Object.keys(data.metadata).length > 10) {
      return false;
    }
    return true;
  }, { message: "Metadata cannot exceed 10 key-value pairs" });
