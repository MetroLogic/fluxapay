import z from "zod";
import { createController } from "../helpers/controller.helper";
import * as settlementSchema from "../schemas/settlement.schema";
import {
    listSettlementsService,
    getSettlementDetailsService,
    getSettlementSummaryService,
    exportSettlementService,
} from "../services/settlement.service";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";

type ListSettlementsRequest = z.infer<typeof settlementSchema.listSettlementsSchema>;
type SettlementDetailsRequest = z.infer<typeof settlementSchema.settlementDetailsSchema>;
type SettlementSummaryRequest = z.infer<typeof settlementSchema.settlementSummarySchema>;
type ExportSettlementRequest = z.infer<typeof settlementSchema.exportSettlementSchema>;

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

export const exportSettlement = createController<ExportSettlementRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        const merchantId = await validateUserId(_reqOriginal);
        const { settlement_id } = req.params;
        const { format } = req.query;
        return exportSettlementService(merchantId, settlement_id, format);
    }
);
