import { Request, Response } from "express";
import z from "zod";
import { Response } from "express";
import { createController } from "../helpers/controller.helper";
import * as settlementSchema from "../schemas/settlement.schema";
import {
    listSettlementsService,
    getSettlementDetailsService,
    getSettlementSummaryService,

    exportSettlementService,
    exportSettlementRangeService,
    getSettlementBatchService,
} from "../services/settlement.service";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import { PrismaClient } from "../generated/client/client";
import { generateSettlementPDF, generateSettlementsRangePDF } from "../utils/pdfGenerator";
import { generateSettlementCSV, generateSettlementsRangeCSV } from "../utils/csvGenerator";

const prisma = new PrismaClient();

type ListSettlementsRequest = z.infer<typeof settlementSchema.listSettlementsSchema>;
type SettlementDetailsRequest = z.infer<typeof settlementSchema.settlementDetailsSchema>;
type SettlementSummaryRequest = z.infer<typeof settlementSchema.settlementSummarySchema>;
type ExportSettlementRequest = z.infer<typeof settlementSchema.exportSettlementSchema>;
type SettlementBatchRequest = z.infer<typeof settlementSchema.settlementBatchSchema>;


export const listSettlements = createController<ListSettlementsRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        const merchantId = await validateUserId(_reqOriginal);
        const { page, limit, status, currency, date_from, date_to } = req.query;

        return listSettlementsService({
            merchantId,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 10,
            status,
            currency,
            date_from,
            date_to,
        });
    }
);

export const getSettlementDetails = createController<SettlementDetailsRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        const merchantId = await validateUserId(_reqOriginal);
        const { settlement_id } = req.params;
        return getSettlementDetailsService(merchantId, settlement_id);
    }
);

export const getSettlementSummary = createController<SettlementSummaryRequest>(
    async (_req: any, _reqOriginal: AuthRequest) => {
        const merchantId = await validateUserId(_reqOriginal);
        return getSettlementSummaryService(merchantId);
    }
);

export const exportSettlement = async (req: AuthRequest, res: Response) => {
    try {
        const merchantId = String(await validateUserId(req));
        const settlement_id = String(req.params.settlement_id);
        const format = req.query.format === "csv" ? "csv" : "pdf";

        const settlement = await prisma.settlement.findFirst({
            where: { id: settlement_id, merchantId },
            include: { merchant: true },
        });

        if (!settlement) {
            return res.status(404).json({ error: "Settlement not found" });
        }

        const payments = await prisma.payment.findMany({
            where: {
                merchantId,
                settlementId: settlement_id,
            },
            orderBy: { createdAt: "desc" },
        });

        if (format === "csv") {
            const csvContent = generateSettlementCSV(settlement, payments);
            res.setHeader("Content-Type", "text/csv");
            res.attachment(`settlement-${settlement_id}.csv`);
            return res.status(200).send(csvContent);
        } else {
            const pdfBuffer = await generateSettlementPDF(settlement, payments);
            res.setHeader("Content-Type", "application/pdf");
            res.attachment(`settlement-${settlement_id}.pdf`);
            return res.status(200).send(pdfBuffer);
        }
    } catch (error: any) {
        console.error("Export settlement error:", error);
        return res.status(error.status || 500).json({ error: error.message || "Failed to export settlement" });
    }
};

export const exportSettlementsRange = async (req: AuthRequest, res: Response) => {
    try {
        const merchantId = await validateUserId(req);
        
        const date_from = req.query.date_from ? String(req.query.date_from) : undefined;
        const date_to = req.query.date_to ? String(req.query.date_to) : undefined;
        const asset = req.query.asset ? String(req.query.asset) : "all";
        const min_discrepancy = req.query.min_discrepancy ? parseFloat(String(req.query.min_discrepancy)) : 0;
        const format = req.query.format === "csv" ? "csv" : "pdf";

        const merchant = await prisma.merchant.findUnique({
            where: { id: merchantId }
        });

        if (!merchant) {
            return res.status(404).json({ error: "Merchant not found" });
        }

        const settlements = await prisma.settlement.findMany({
            where: {
                merchantId,
                created_at: {
                    ...(date_from && { gte: new Date(date_from) }),
                    ...(date_to && { lte: new Date(date_to) }),
                },
                ...(asset !== "all" && {
                    payments: {
                        some: {
                            currency: asset
                        }
                    }
                })
            },
            include: {
                payments: true
            },
            orderBy: {
                created_at: "desc"
            }
        });

        // Filter settlements by minimum discrepancy threshold
        const filteredSettlements = settlements.filter(s => {
            const discrepancy = Math.abs(Number(s.usdc_amount) - (Number(s.net_amount) + Number(s.fees)));
            return discrepancy >= min_discrepancy;
        });

        if (format === "csv") {
            const csvContent = generateSettlementsRangeCSV(filteredSettlements);
            res.setHeader("Content-Type", "text/csv");
            res.attachment(`reconciliation-report.csv`);
            return res.status(200).send(csvContent);
        } else {
            const pdfBuffer = await generateSettlementsRangePDF(
                merchant.business_name,
                filteredSettlements,
                { date_from, date_to, asset, min_discrepancy }
            );
            res.setHeader("Content-Type", "application/pdf");
            res.attachment(`reconciliation-report.pdf`);
            return res.status(200).send(pdfBuffer);
        }
    } catch (error: any) {
        console.error("Export settlements range error:", error);
        return res.status(error.status || 500).json({ error: error.message || "Failed to export reconciliation report" });
    }
};

);

export const exportSettlementRange = async (req: Request, res: Response) => {
    try {
        const merchantId = await validateUserId(req as AuthRequest);
        const { date_from, date_to, format = "csv" } = req.query as Record<string, string | undefined>;
        const result = await exportSettlementRangeService({
            merchantId,
            date_from,
            date_to,
            format: format as "csv" | "pdf",
        });

        if (result.contentType === "text/csv") {
            res.setHeader("Content-Type", result.contentType);
            res.attachment(result.filename);
            return res.status(200).send(result.content);
        }

        return res.status(200).json(result);
    } catch (err: any) {
        console.error(err);
        res.status(err.status || 500).json({ message: err.message || "Server error" });
    }
};

export const getSettlementBatch = createController<SettlementBatchRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        const merchantId = await validateUserId(_reqOriginal);
        const { date_from, date_to } = req.query || {};

        return getSettlementBatchService(merchantId, date_from, date_to);
    }
);
