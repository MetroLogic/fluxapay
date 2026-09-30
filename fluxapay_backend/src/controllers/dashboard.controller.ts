import { createController } from "../helpers/controller.helper";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

import * as dashboardService from "../services/dashboard.service";
import { AuthRequest } from "../types/express";
import { Response } from "express";
import { queryAuditLogs } from "../services/audit.service";
import { AuditActionType } from "../types/audit.types";

export const overviewMetrics = createController(
  dashboardService.getDashboardOverview,
  200,
);

export const analytics = createController(
  dashboardService.getDashboardAnalytics,
  200,
);

export const activity = createController(
  dashboardService.getDashboardActivity,
  200,
);

/**
 * GET /api/v1/dashboard/audit-logs
 * Read-only access to audit logs scoped to the authenticated merchant.
 */
export async function getMerchantAuditLogs(req: AuthRequest, res: Response) {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const { date_from, date_to, action_type, page, limit } = req.query;

    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (date_from) {
      dateFrom = new Date(date_from as string);
      if (isNaN(dateFrom.getTime())) {
        return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid date_from format"));
      }
    }

    if (date_to) {
      dateTo = new Date(date_to as string);
      if (isNaN(dateTo.getTime())) {
        return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid date_to format"));
      }
    }

    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit as string, 10), 50) : 20;

    // Validate action_type if provided
    let actionType: AuditActionType | undefined;
    if (action_type) {
      if (!Object.values(AuditActionType).includes(action_type as AuditActionType)) {
        return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid action_type"));
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
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to fetch audit logs"));
  }
}

/**
 * Escape a value for CSV output.
 */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(str)) {
    return `${str.replace(/"(/g, '""')}`;
  }
  return str;
}

/**
 * GET /api/v1/dashboard/audit-logs/export
 * Export audit logs (transaction reports) as CSV for the authenticated merchant.
 */
export async function exportMerchantAuditLogsCsv(req: AuthRequest, res: Response) {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Authentication required"));
    }

    const { date_from, date_to, action_type } = req.query;

    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (date_from) {
      dateFrom = new Date(date_from as string);
      if (isNaN(dateFrom.getTime())) {
        return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid date_from format"));
      }
    }

    if (date_to) {
      dateTo = new Date(date_to as string);
      if (isNaN(dateTo.getTime())) {
        return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid date_to format"));
      }
    }

    // Validate action_type if provided
    let actionType: AuditActionType | undefined;
    if (action_type) {
      if (!Object.values(AuditActionType).includes(action_type as AuditActionType)) {
        return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid action_type"));
      }
      actionType = action_type as AuditActionType;
    }

    // Fetch all matching logs for export (capped to a reasonable maximum)
    const MAX_EXPORT_ROWS = 10000;
    const result = await queryAuditLogs({
      dateFrom,
      dateTo,
      adminId: merchantId,
      actionType,
      page: 1,
      limit: MAX_EXPORT_ROWS,
    });

    const headers = [
      "id",
      "action_type",
      "description",
      "admin_id",
      "ip_address",
      "user_agent",
      "metadata",
      "created_at",
    ];

    const lines = [headers.join(",")];
    for (const log of result.logs as any[]) {
      const row = [
        log.id,
        log.actionType,
        log.description,
        log.adminId,
        log.ipAddress,
        log.userAgent,
        log.metadata ? JSON.stringify(log.metadata) : "",
        log.createdAt,
      ].map(escapeCsvField).join(",");
      lines.push(row);
    }

    const csv = lines.join("\r\n");
    const filename = `transaction-report-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error: any) {
    console.error("Error exporting merchant audit logs to CSV:", error);
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to export transaction report"));
  }
}
