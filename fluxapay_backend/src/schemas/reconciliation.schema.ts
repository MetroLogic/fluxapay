import { z } from "zod";

export const runReconciliationSchema = z.object({
    body: z.object({
        period_start: z.string().min(1, "Period start date is required"),
        period_end: z.string().min(1, "Period end date is required"),
        actual_balance: z.number().optional(),
    }),
});

export const listReconciliationsSchema = z.object({
    query: z.object({
        page: z.string().optional().default("1"),
        limit: z.string().optional().default("10"),
        status: z.enum(["all", "pending", "matched", "discrepancy", "reviewed", "resolved"]).optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
    }).optional(),
});

export const reconciliationDetailsSchema = z.object({
    params: z.object({
        reconciliation_id: z.string(),
    }),
});

export const listAlertsSchema = z.object({
    query: z.object({
        page: z.string().optional().default("1"),
        limit: z.string().optional().default("10"),
        severity: z.enum(["all", "low", "medium", "high", "critical"]).optional(),
        acknowledged: z.string().optional(),
    }).optional(),
});

export const acknowledgeAlertSchema = z.object({
    params: z.object({
        alert_id: z.string(),
    }),
});

export const reviewReconciliationSchema = z.object({
    params: z.object({
        reconciliation_id: z.string(),
    }),
    body: z.object({
        notes: z.string().optional(),
    }).optional(),
});

export const reconciliationSummarySchema = z.object({
    query: z.object({}).optional(),
});
