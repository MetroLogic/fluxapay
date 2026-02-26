import z from "zod";
import { createController } from "../helpers/controller.helper";
import * as reconciliationSchema from "../schemas/reconciliation.schema";
import {
    runReconciliationService,
    listReconciliationsService,
    getReconciliationDetailsService,
    listReconciliationAlertsService,
    acknowledgeAlertService,
    reviewReconciliationService,
    getReconciliationSummaryService,
} from "../services/reconciliation.service";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";

type RunReconciliationRequest = z.infer<typeof reconciliationSchema.runReconciliationSchema>;
type ListReconciliationsRequest = z.infer<typeof reconciliationSchema.listReconciliationsSchema>;
type ReconciliationDetailsRequest = z.infer<typeof reconciliationSchema.reconciliationDetailsSchema>;
type ListAlertsRequest = z.infer<typeof reconciliationSchema.listAlertsSchema>;
type AcknowledgeAlertRequest = z.infer<typeof reconciliationSchema.acknowledgeAlertSchema>;
type ReviewReconciliationRequest = z.infer<typeof reconciliationSchema.reviewReconciliationSchema>;
type ReconciliationSummaryRequest = z.infer<typeof reconciliationSchema.reconciliationSummarySchema>;

export const runReconciliation = createController<RunReconciliationRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        await validateUserId(_reqOriginal);
        const { period_start, period_end, actual_balance } = req;
        return runReconciliationService({
            periodStart: period_start,
            periodEnd: period_end,
            actualBalance: actual_balance,
        });
    }
);

export const listReconciliations = createController<ListReconciliationsRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        await validateUserId(_reqOriginal);
        const query = req.query || {};
        return listReconciliationsService({
            page: parseInt(query.page) || 1,
            limit: parseInt(query.limit) || 10,
            status: query.status,
            dateFrom: query.date_from,
            dateTo: query.date_to,
        });
    }
);

export const getReconciliationDetails = createController<ReconciliationDetailsRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        await validateUserId(_reqOriginal);
        const { reconciliation_id } = req.params;
        return getReconciliationDetailsService(reconciliation_id);
    }
);

export const listAlerts = createController<ListAlertsRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        await validateUserId(_reqOriginal);
        const query = req.query || {};
        return listReconciliationAlertsService({
            page: parseInt(query.page) || 1,
            limit: parseInt(query.limit) || 10,
            severity: query.severity,
            acknowledged: query.acknowledged === "true" ? true : query.acknowledged === "false" ? false : undefined,
        });
    }
);

export const acknowledgeAlert = createController<AcknowledgeAlertRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        const userId = await validateUserId(_reqOriginal);
        const { alert_id } = req.params;
        return acknowledgeAlertService(alert_id, userId);
    }
);

export const reviewReconciliation = createController<ReviewReconciliationRequest>(
    async (req: any, _reqOriginal: AuthRequest) => {
        const userId = await validateUserId(_reqOriginal);
        const { reconciliation_id } = req.params;
        const body = req.body || {};
        return reviewReconciliationService(reconciliation_id, userId, body.notes);
    }
);

export const getReconciliationSummary = createController<ReconciliationSummaryRequest>(
    async (_req: any, _reqOriginal: AuthRequest) => {
        await validateUserId(_reqOriginal);
        return getReconciliationSummaryService();
    }
);
