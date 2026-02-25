import { PrismaClient, AuditActionType, AuditEntityType, KYCStatus, Prisma } from '../generated/client';
import {
  CreateAuditLogParams,
  QueryAuditLogsParams,
  PaginationInfo,
  KycDecisionDetails,
  ConfigChangeDetails,
  SweepOperationDetails,
  SettlementBatchDetails,
} from '../types/audit.types';

const prisma = new PrismaClient();

// Utility function for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Logger placeholder - replace with actual logger
const logger = {
  info: (message: string, data?: any) => console.log(JSON.stringify({ level: 'info', message, ...data })),
  warn: (message: string, data?: any) => console.warn(JSON.stringify({ level: 'warn', message, ...data })),
  error: (message: string, data?: any) => console.error(JSON.stringify({ level: 'error', message, ...data })),
};

// Metrics placeholder - replace with actual metrics service
const metrics = {
  increment: (metric: string, tags?: any) => {
    // Placeholder for metrics emission
    console.log(`Metric: ${metric}`, tags);
  },
};

/**
 * Safe audit log wrapper with retry logic and error handling
 */
async function safeAuditLog<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T | null> {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      return await operation();
    } catch (error: any) {
      attempts++;
      logger.error('Audit log failure', {
        context,
        attempt: attempts,
        error: error.message,
      });

      if (attempts < maxAttempts) {
        await delay(Math.pow(2, attempts) * 100); // Exponential backoff: 100ms, 200ms, 400ms
      }
    }
  }

  // Emit metric for monitoring
  metrics.increment('audit_log_failure', { context });
  return null;
}

/**
 * Emit structured log for audit entry
 */
function emitStructuredLog(auditLog: any, success: boolean) {
  const logData = {
    level: success ? 'info' : 'warn',
    message: `Audit: ${auditLog.action_type}`,
    timestamp: auditLog.created_at.toISOString(),
    audit_log_id: auditLog.id,
    admin_id: auditLog.admin_id,
    action_type: auditLog.action_type,
    entity_type: auditLog.entity_type,
    entity_id: auditLog.entity_id,
    details: auditLog.details,
  };

  if (success) {
    logger.info(logData.message, logData);
  } else {
    logger.warn(logData.message, logData);
  }
}

/**
 * Redact sensitive configuration values
 */
function redactSensitiveValue(value: string, isSensitive: boolean): string {
  if (!isSensitive) return value;
  return '***REDACTED***';
}

/**
 * Create audit log entry
 */
async function createAuditLog(
  params: CreateAuditLogParams,
  tx?: Prisma.TransactionClient
): Promise<any | null> {
  const client = tx || prisma;

  return await safeAuditLog(async () => {
    const auditLog = await client.auditLog.create({
      data: {
        admin_id: params.admin_id,
        action_type: params.action_type,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        details: params.details,
      },
    });

    emitStructuredLog(auditLog, true);
    return auditLog;
  }, `create_audit_log_${params.action_type}`);
}

/**
 * Log KYC decision (approve or reject)
 */
export async function logKycDecision(params: {
  adminId: string;
  merchantId: string;
  action: 'approve' | 'reject';
  previousStatus: KYCStatus;
  newStatus: KYCStatus;
  reason?: string;
}, tx?: Prisma.TransactionClient): Promise<any | null> {
  const details: KycDecisionDetails = {
    merchant_id: params.merchantId,
    previous_status: params.previousStatus,
    new_status: params.newStatus,
    reason: params.reason,
    reviewed_at: new Date().toISOString(),
  };

  return await createAuditLog(
    {
      admin_id: params.adminId,
      action_type: params.action === 'approve' ? AuditActionType.kyc_approve : AuditActionType.kyc_reject,
      entity_type: AuditEntityType.merchant_kyc,
      entity_id: params.merchantId,
      details,
    },
    tx
  );
}

/**
 * Log configuration change
 */
export async function logConfigChange(params: {
  adminId: string;
  configKey: string;
  previousValue: string;
  newValue: string;
  isSensitive?: boolean;
}, tx?: Prisma.TransactionClient): Promise<any | null> {
  const isSensitive = params.isSensitive || false;

  const details: ConfigChangeDetails = {
    config_key: params.configKey,
    previous_value: redactSensitiveValue(params.previousValue, isSensitive),
    new_value: redactSensitiveValue(params.newValue, isSensitive),
    is_sensitive: isSensitive,
  };

  return await createAuditLog(
    {
      admin_id: params.adminId,
      action_type: AuditActionType.config_change,
      entity_type: AuditEntityType.system_config,
      entity_id: params.configKey,
      details,
    },
    tx
  );
}

/**
 * Log sweep trigger
 */
export async function logSweepTrigger(params: {
  adminId: string;
  sweepType: string;
  reason: string;
}): Promise<any | null> {
  const sweepId = `sweep_${Date.now()}`;

  const details: SweepOperationDetails = {
    sweep_type: params.sweepType,
    trigger_reason: params.reason,
  };

  return await createAuditLog({
    admin_id: params.adminId,
    action_type: AuditActionType.sweep_trigger,
    entity_type: AuditEntityType.sweep_operation,
    entity_id: sweepId,
    details,
  });
}

/**
 * Update sweep completion status
 */
export async function updateSweepCompletion(params: {
  auditLogId: string;
  status: 'completed' | 'failed';
  statistics?: {
    addresses_swept: number;
    total_amount: string;
    transaction_hash?: string;
  };
  failureReason?: string;
}): Promise<any | null> {
  return await safeAuditLog(async () => {
    const existingLog = await prisma.auditLog.findUnique({
      where: { id: params.auditLogId },
    });

    if (!existingLog) {
      throw new Error(`Audit log ${params.auditLogId} not found`);
    }

    const updatedDetails = {
      ...(existingLog.details as any),
      status: params.status,
      statistics: params.statistics,
      failure_reason: params.failureReason,
    };

    const updatedLog = await prisma.auditLog.update({
      where: { id: params.auditLogId },
      data: {
        details: updatedDetails,
        action_type: params.status === 'completed' 
          ? AuditActionType.sweep_complete 
          : AuditActionType.sweep_fail,
      },
    });

    emitStructuredLog(updatedLog, params.status === 'completed');
    return updatedLog;
  }, `update_sweep_completion_${params.auditLogId}`);
}

/**
 * Log settlement batch initiation
 */
export async function logSettlementBatch(params: {
  adminId: string;
  batchId: string;
  reason: string;
}): Promise<any | null> {
  const details: SettlementBatchDetails = {
    batch_id: params.batchId,
    initiation_reason: params.reason,
  };

  return await createAuditLog({
    admin_id: params.adminId,
    action_type: AuditActionType.settlement_batch_initiate,
    entity_type: AuditEntityType.settlement_batch,
    entity_id: params.batchId,
    details,
  });
}

/**
 * Update settlement batch completion status
 */
export async function updateSettlementBatchCompletion(params: {
  auditLogId: string;
  status: 'completed' | 'failed';
  transactionCount?: number;
  totalAmount?: number;
  currency?: string;
  failureReason?: string;
}): Promise<any | null> {
  return await safeAuditLog(async () => {
    const existingLog = await prisma.auditLog.findUnique({
      where: { id: params.auditLogId },
    });

    if (!existingLog) {
      throw new Error(`Audit log ${params.auditLogId} not found`);
    }

    const updatedDetails = {
      ...(existingLog.details as any),
      status: params.status,
      transaction_count: params.transactionCount,
      total_amount: params.totalAmount,
      currency: params.currency,
      completed_at: new Date().toISOString(),
      failure_reason: params.failureReason,
    };

    const updatedLog = await prisma.auditLog.update({
      where: { id: params.auditLogId },
      data: {
        details: updatedDetails,
        action_type: params.status === 'completed'
          ? AuditActionType.settlement_batch_complete
          : AuditActionType.settlement_batch_fail,
      },
    });

    emitStructuredLog(updatedLog, params.status === 'completed');
    return updatedLog;
  }, `update_settlement_batch_completion_${params.auditLogId}`);
}

/**
 * Query audit logs with filters and pagination
 */
export async function queryAuditLogs(params: QueryAuditLogsParams): Promise<{
  logs: any[];
  pagination: PaginationInfo;
}> {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  if (params.dateFrom || params.dateTo) {
    where.created_at = {};
    if (params.dateFrom) {
      where.created_at.gte = params.dateFrom;
    }
    if (params.dateTo) {
      where.created_at.lte = params.dateTo;
    }
  }

  if (params.adminId) {
    where.admin_id = params.adminId;
  }

  if (params.actionType) {
    where.action_type = params.actionType;
  }

  if (params.entityId) {
    where.entity_id = params.entityId;
  }

  // Get total count
  const total = await prisma.auditLog.count({ where });

  // Get paginated results
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { created_at: 'desc' },
    skip,
    take: limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

/**
 * Get audit log by ID
 */
export async function getAuditLogById(id: string): Promise<any | null> {
  return await prisma.auditLog.findUnique({
    where: { id },
  });
}
