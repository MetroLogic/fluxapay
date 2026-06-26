import { Response } from "express";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { AuthRequest } from "../types/express";
import { queryAuditLogs, getAuditLogById } from "../services/audit.service";
import { AuditActionType } from "../types/audit.types";
import { PrismaClient } from "../generated/client/client";

const prisma = new PrismaClient();

/**
 * GET /api/admin/audit-logs
 * Query audit logs with filters
 */
export async function getAuditLogs(req: AuthRequest, res: Response) {
  try {
    const {
      date_from,
      date_to,
      admin_id,
      action_type,
      entity_id,
      page,
      limit,
    } = req.query;

    // Parse and validate date parameters
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

    // Validate date range
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "date_from must be before date_to"));
    }

    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 50;

    if (isNaN(pageNum) || pageNum < 1) {
      return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "page must be a positive integer"));
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "limit must be between 1 and 100"));
    }

    // Validate action_type if provided
    let actionType: AuditActionType | undefined;
    if (action_type) {
      if (
        !Object.values(AuditActionType).includes(action_type as AuditActionType)
      ) {
        return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid action_type"));
      }
      actionType = action_type as AuditActionType;
    }

    // Query audit logs
    const result = await queryAuditLogs({
      dateFrom,
      dateTo,
      adminId: admin_id as string | undefined,
      actionType,
      entityId: entity_id as string | undefined,
      page: pageNum,
      limit: limitNum,
    });

    return res.status(200).json({
      success: true,
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error("Error querying audit logs:", error);
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to query audit logs"));
  }
}

/**
 * GET /api/admin/audit-logs/:id
 * Get specific audit log entry
 */
export async function getAuditLogByIdHandler(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string") {
      return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Audit log ID is required"));
    }

    const auditLog = await getAuditLogById(id);

    if (!auditLog) {
      return sendApiError(res, apiError(404, ErrorCode.NOT_FOUND, "Audit log not found"));
    }

    return res.status(200).json({
      success: true,
      data: auditLog,
    });
  } catch (error: any) {
    console.error("Error fetching audit log:", error);
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to fetch audit log"));
  }
}

/**
 * GET /api/admin/settlements/:settlement_id/payout-payload
 * Get raw payout partner payload for a settlement (Admin only)
 */
export async function getSettlementPayoutPayload(req: AuthRequest, res: Response) {
  try {
    const { settlement_id } = req.params;

    if (!settlement_id || typeof settlement_id !== "string") {
      return sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, "Settlement ID is required"));
    }

    const settlement = await prisma.settlement.findUnique({
      where: { id: settlement_id },
      select: {
        id: true,
        merchantId: true,
        exchange_partner: true,
        payout_partner_payload: true,
        created_at: true,
        processed_date: true,
      },
    });

    if (!settlement) {
      return sendApiError(res, apiError(404, ErrorCode.SETTLEMENT_NOT_FOUND, "Settlement not found"));
    }

    if (!settlement.payout_partner_payload) {
      return sendApiError(res, apiError(404, ErrorCode.NOT_FOUND, "No payout payload available for this settlement"));
    }

    return res.status(200).json({
      success: true,
      data: {
        settlement_id: settlement.id,
        merchant_id: settlement.merchantId,
        exchange_partner: settlement.exchange_partner,
        payout_partner_payload: settlement.payout_partner_payload,
        created_at: settlement.created_at,
        processed_date: settlement.processed_date,
      },
    });
  } catch (error: any) {
    console.error("Error fetching settlement payout payload:", error);
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to fetch payout payload"));
  }
}
