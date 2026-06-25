import { z } from "zod";

export const reconciliationSummaryQuerySchema = z.object({
  merchant_id: z.string().optional(),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
});

export const discrepancyAlertsQuerySchema = z.object({
  merchant_id: z.string().optional(),
  is_resolved: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const upsertThresholdSchema = z.object({
  merchant_id: z.string().optional(),
  amount_threshold: z.coerce.number().nonnegative(),
  percent_threshold: z.coerce.number().nonnegative(),
  is_active: z.boolean().default(true),
});

export const resolveAlertSchema = z.object({
  is_resolved: z.boolean().default(true),
});
