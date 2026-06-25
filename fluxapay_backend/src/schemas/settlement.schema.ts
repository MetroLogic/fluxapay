import { z } from "zod";

export const listSettlementsSchema = z.object({
    query: z.object({
        page: z.string().optional().default("1"),
        limit: z.string().optional().default("10"),
        status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
        currency: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
    }),
});

export const settlementDetailsSchema = z.object({
    params: z.object({
        settlement_id: z.string(),
    }),
});

export const settlementSummarySchema = z.object({
    query: z.object({
        month: z.string().optional(),
        year: z.string().optional(),
    }).optional(),
});

export const exportSettlementSchema = z.object({
    params: z.object({
        settlement_id: z.string(),
    }),
    query: z.object({
        format: z.enum(["pdf", "csv"]).default("pdf"),
    }),
});

export const exportSettlementsRangeSchema = z.object({
    query: z.object({
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        asset: z.enum(["USDC", "XLM", "all"]).default("all"),
        min_discrepancy: z.string().optional().default("0"),
        format: z.enum(["pdf", "csv"]).default("pdf"),
    }),
});

