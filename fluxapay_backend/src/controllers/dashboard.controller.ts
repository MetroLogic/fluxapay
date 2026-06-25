import { createController } from "../helpers/controller.helper";

import * as dashboardService from "../services/dashboard.service";
import { AuthRequest } from "../types/express";
import { Response } from "express";
import { queryAuditLogs } from "../services/audit.service";
import { AuditActionType } from "../types/audit.types";

export const overviewMetrics = createController(
  dashboardService.getDashboardOverview,
  201,
);

export const analytics = createController(
  dashboardService.getDashboardAnalytics,
  201,
);

export const activity = createController(
  dashboardService.getDashboardActivity,
  201,
);

/**
 * GET /api/v1/dashboard/audit-logs
 * Read-only access to audit logs scoped to the authenticated merchant.
 */
export async function getMerchantAuditLogs(req: AuthRequest, res: Response) {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }

    const { date_from, date_to, action_type, page, limit } = req.query;

    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (date_from) {
      dateFrom = new Date(date_from as string);
      if (isNaN(dateFrom.getTime())) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid date_from format" } });
      }
    }

    if (date_to) {
      dateTo = new Date(date_to as string);
      if (isNaN(dateTo.getTime())) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid date_to format" } });
      }
    }

    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit as string, 10), 50) : 20;

    // Validate action_type if provided
    let actionType: AuditActionType | undefined;
    if (action_type) {
      if (!Object.values(AuditActionType).includes(action_type as AuditActionType)) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid action_type" } });
      }
      actionType = action_type as AuditActionType;
    }

    // Scope logs to this merchant only (admin_id = merchantId for merchant-initiated actions)
    const result = await queryAuditLogs({
      dateFrom,
      dateTo,
      adminId: merchantId,
      actionType,
      page: pageNum,
      limit: limitNum,
    });

    return res.status(200).json({
      success: true,
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error("Error fetching merchant audit logs:", error);
    return res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch audit logs" } });
  }
}
