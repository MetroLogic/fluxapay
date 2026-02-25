import { Response } from 'express';
import { AuthRequest } from '../types/express';
import { queryAuditLogs, getAuditLogById } from '../services/audit.service';
import { AuditActionType } from '../generated/client';

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
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid date_from format',
          },
        });
      }
    }

    if (date_to) {
      dateTo = new Date(date_to as string);
      if (isNaN(dateTo.getTime())) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid date_to format',
          },
        });
      }
    }

    // Validate date range
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'date_from must be before date_to',
        },
      });
    }

    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 50;

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'page must be a positive integer',
        },
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'limit must be between 1 and 100',
        },
      });
    }

    // Validate action_type if provided
    let actionType: AuditActionType | undefined;
    if (action_type) {
      if (!Object.values(AuditActionType).includes(action_type as AuditActionType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid action_type',
          },
        });
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
    console.error('Error querying audit logs:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to query audit logs',
      },
    });
  }
}

/**
 * GET /api/admin/audit-logs/:id
 * Get specific audit log entry
 */
export async function getAuditLogByIdHandler(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Audit log ID is required',
        },
      });
    }

    const auditLog = await getAuditLogById(id);

    if (!auditLog) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Audit log not found',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: auditLog,
    });
  } catch (error: any) {
    console.error('Error fetching audit log:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch audit log',
      },
    });
  }
}
