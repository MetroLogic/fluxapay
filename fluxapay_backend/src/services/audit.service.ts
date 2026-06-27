import { PrismaClient, Prisma } from '../generated/client/client';
import {
  AuditActionType,
  AuditEntityType,
  KYCStatus,
  CreateAuditLogParams,
  QueryAuditLogsParams,
  PaginationInfo,
  KycDecisionDetails,
  ConfigChangeDetails,
  SweepOperationDetails,
  SettlementBatchDetails,
} from "../types/audit.types";

const prisma = new PrismaClient();

// Utility function for delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Logger placeholder - replace with actual logger
const logger = {
  info: (message: string, data?: any) =>
    console.log(JSON.stringify({ level: "info", message, ...data })),
  warn: (message: string, data?: any) =>
    console.warn(JSON.stringify({ level: "warn", message, ...data })),
  error: (message: string, data?: any) =>
    console.error(JSON.stringify({ level: "error", message, ...data })),
};

// Metrics placeholder - replace with actual metrics service
const metrics = {
  increment: (metric: string, tags?: any) => {
    // Placeholder for metrics emission
    console.log(`Metric: ${metric}`, tags);
  },
};

/**
 * Safe audit log wrapper with retry logic — throws if all attempts fail.
 */
async function safeAuditLog<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<T> {
  let attempts = 0;
  const maxAttempts = 3;
  let lastError: Error | undefined;

  while (attempts < maxAttempts) {
    try {
      return await operation();
    } catch (error: unknown) {
      attempts++;
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.error("Audit log failure", {
        context,
        attempt: attempts,
        error: lastError.message,
      });

      if (attempts < maxAttempts) {
        await delay(Math.pow(2, attempts) * 100);
      }
    }
  }

  metrics.increment("audit_log_failure", { context });
  throw new Error(
    `Audit log write failed after ${maxAttempts} attempts (${context}): ${lastError?.message}`,
  );
}

/**
 * Emit structured log for audit entry
 */
function emitStructuredLog(auditLog: any, success: boolean) {
  const logData = {
    level: success ? "info" : "warn",
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
  return "***REDACTED***";
}

/**
 * Create audit log entry
 */
async function createAuditLog(
  params: CreateAuditLogParams,
  tx?: Prisma.TransactionClient,
): Promise<any> {
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
export async function logKycDecision(
  params: {
    adminId: string;
    merchantId: string;
    action: "approve" | "reject";
    previousStatus: KYCStatus;
    newStatus: KYCStatus;
    reason?: string;
  },
  tx?: Prisma.TransactionClient,
): Promise<any> {
  const details: KycDecisionDetails = {
    merchant_id: params.merchantId,
    previous_status: params.previousStatus,
    new_status: params.newStatus,
    reason: params.reason,
    reviewed_at: new Date().toISOString(),
  };

  const actionType =
    params.action === "approve"
      ? AuditActionType.kyc_approve
      : AuditActionType.kyc_reject;

  return await createAuditLog(
    {
      admin_id: params.adminId,
      action_type: actionType,
      entity_type: AuditEntityType.merchant_kyc,
      entity_id: params.merchantId,
      details,
    },
    tx,
  );
}

/**
 * Log configuration change (single key — legacy helper)
 */
export async function logConfigChange(
  params: {
    adminId: string;
    configKey: string;
    previousValue: string;
    newValue: string;
    isSensitive?: boolean;
  },
  tx?: Prisma.TransactionClient,
): Promise<any> {
  return logConfigUpdated(
    {
      adminId: params.adminId,
      changedFields: [params.configKey],
      oldValues: { [params.configKey]: redactSensitiveValue(params.previousValue, params.isSensitive ?? false) },
      newValues: { [params.configKey]: redactSensitiveValue(params.newValue, params.isSensitive ?? false) },
    },
    tx,
  );
}

/**
 * Log admin configuration update with full field diff
 */
export async function logConfigUpdated(
  params: {
    adminId: string;
    changedFields: string[];
    oldValues: Record<string, unknown>;
    newValues: Record<string, unknown>;
    sensitiveFields?: string[];
  },
  tx?: Prisma.TransactionClient,
): Promise<any> {
  const sensitive = new Set(params.sensitiveFields ?? []);
  const redactRecord = (record: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        sensitive.has(key) ? redactSensitiveValue(String(value), true) : value,
      ]),
    );

  const details: ConfigChangeDetails = {
    changed_fields: params.changedFields,
    old_values: redactRecord(params.oldValues),
    new_values: redactRecord(params.newValues),
    updated_at: new Date().toISOString(),
  };

  return await createAuditLog(
    {
      admin_id: params.adminId,
      action_type: AuditActionType.config_updated,
      entity_type: AuditEntityType.system_config,
      entity_id: params.changedFields.join(",") || "system",
      details,
    },
    tx,
  );
}

/**
 * Log merchant deletion (soft-delete / anonymization executed)
 */
export async function logMerchantDeleted(
  params: {
    adminId: string;
    merchantId: string;
    reason?: string;
  },
  tx?: Prisma.TransactionClient,
): Promise<any> {
  const details = {
    merchant_id: params.merchantId,
    actor: params.adminId,
    reason: params.reason,
    deleted_at: new Date().toISOString(),
  };

  return await createAuditLog(
    {
      admin_id: params.adminId,
      action_type: AuditActionType.merchant_deleted,
      entity_type: AuditEntityType.merchant_account,
      entity_id: params.merchantId,
      details,
    },
    tx,
  );
}

export async function logApiKeysRevoked(
  params: { adminId: string; merchantId: string; revokedCount: number },
  tx?: Prisma.TransactionClient,
): Promise<any> {
  return await createAuditLog(
    {
      admin_id: params.adminId,
      action_type: AuditActionType.api_keys_revoked,
      entity_type: AuditEntityType.api_key,
      entity_id: params.merchantId,
      details: {
        merchant_id: params.merchantId,
        revoked_count: params.revokedCount,
        revoked_at: new Date().toISOString(),
      },
    },
    tx,
  );
}

export async function logWebhooksDeactivated(
  params: { adminId: string; merchantId: string; cancelledDeliveryCount: number },
  tx?: Prisma.TransactionClient,
): Promise<any> {
  return await createAuditLog(
    {
      admin_id: params.adminId,
      action_type: AuditActionType.webhooks_deactivated,
      entity_type: AuditEntityType.webhook_secret,
      entity_id: params.merchantId,
      details: {
        merchant_id: params.merchantId,
        cancelled_delivery_count: params.cancelledDeliveryCount,
        deactivated_at: new Date().toISOString(),
      },
    },
    tx,
  );
}

export async function logChargesCancelled(
  params: { adminId: string; merchantId: string; cancelledCount: number },
  tx?: Prisma.TransactionClient,
): Promise<any> {
  return await createAuditLog(
    {
      admin_id: params.adminId,
      action_type: AuditActionType.charges_cancelled,
      entity_type: AuditEntityType.payment_gateway,
      entity_id: params.merchantId,
      details: {
        merchant_id: params.merchantId,
        cancelled_count: params.cancelledCount,
        cancelled_at: new Date().toISOString(),
      },
    },
    tx,
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
  status: "completed" | "failed";
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

    const sweepActionType =
      params.status === "completed"
        ? AuditActionType.sweep_complete
        : AuditActionType.sweep_fail;

    const updatedLog = await prisma.auditLog.update({
      where: { id: params.auditLogId },
      data: {
        details: updatedDetails,
        action_type: sweepActionType,
      },
    });

    emitStructuredLog(updatedLog, params.status === "completed");
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
  status: "completed" | "failed" | "partial";
  transactionCount?: number;
  totalAmount?: number;
  currency?: string;
  failureReason?: string;
  merchantResults?: SettlementBatchDetails["merchant_results"];
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
      merchant_results: params.merchantResults,
    };

    const completionActionType =
      params.status === "failed"
        ? AuditActionType.settlement_batch_fail
        : AuditActionType.settlement_batch_complete;

    const updatedLog = await prisma.auditLog.update({
      where: { id: params.auditLogId },
      data: {
        details: updatedDetails,
        action_type: completionActionType,
      },
    });

    emitStructuredLog(updatedLog, params.status !== "failed");
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

  if (params.actionType || params.eventType) {
    where.action_type = params.actionType ?? params.eventType;
  }

  if (params.entityId) {
    where.entity_id = params.entityId;
  }

  // Get total count
  const total = await prisma.auditLog.count({ where });

  // Get paginated results
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { created_at: "desc" },
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

/**
 * Log merchant profile update
 */
export async function logMerchantProfileUpdate(params: {
  merchantId: string;
  changedFields: string[];
  oldValues: Record<string, any>;
  newValues: Record<string, any>;
}): Promise<any | null> {
  const details = {
    merchant_id: params.merchantId,
    changed_fields: params.changedFields,
    old_values: params.oldValues,
    new_values: params.newValues,
    changed_at: new Date().toISOString(),
  };

  return await createAuditLog({
    admin_id: params.merchantId,
    action_type: AuditActionType.merchant_profile_updated,
    entity_type: AuditEntityType.merchant_account,
    entity_id: params.merchantId,
    details,
  });
}

/**
 * Log bank account change (create or update)
 */
export async function logBankAccountChange(params: {
  merchantId: string;
  action: "created" | "updated";
  changedFields: string[];
  oldValues: Record<string, any>;
  newValues: Record<string, any>;
}): Promise<any | null> {
  const details = {
    merchant_id: params.merchantId,
    action: params.action,
    changed_fields: params.changedFields,
    old_values: params.oldValues,
    new_values: params.newValues,
    changed_at: new Date().toISOString(),
  };

  return await createAuditLog({
    admin_id: params.merchantId,
    action_type: AuditActionType.bank_account_updated,
    entity_type: AuditEntityType.bank_account,
    entity_id: params.merchantId,
    details,
  });
}

/**
 * Log API key rotation
 */
export async function logApiKeyRotation(params: {
  merchantId: string;
  lastFour: string;
}): Promise<any | null> {
  const details = {
    merchant_id: params.merchantId,
    rotated_at: new Date().toISOString(),
    last_four: params.lastFour,
  };

  return await createAuditLog({
    admin_id: params.merchantId,
    action_type: AuditActionType.api_key_rotated,
    entity_type: AuditEntityType.api_key,
    entity_id: params.merchantId,
    details,
  });
}

/**
 * Log webhook secret rotation
 */
export async function logWebhookSecretRotation(params: {
  merchantId: string;
}): Promise<any | null> {
  const details = {
    merchant_id: params.merchantId,
    rotated_at: new Date().toISOString(),
  };

  return await createAuditLog({
    admin_id: params.merchantId,
    action_type: AuditActionType.webhook_secret_rotated,
    entity_type: AuditEntityType.webhook_secret,
    entity_id: params.merchantId,
    details,
  });
}

/** Log data export requested */
export async function logDataExportRequested(params: {
  actorId: string;
  merchantId: string;
  jobId: string;
  requestedBy: string;
}): Promise<any | null> {
  return await createAuditLog({
    admin_id: params.actorId,
    action_type: AuditActionType.data_export_requested,
    entity_type: AuditEntityType.data_export_job,
    entity_id: params.jobId,
    details: {
      merchant_id: params.merchantId,
      job_id: params.jobId,
      requested_by: params.requestedBy,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function logDataExportCompleted(params: {
  actorId: string;
  merchantId: string;
  jobId: string;
  rowCount: number;
}): Promise<any | null> {
  return await createAuditLog({
    admin_id: params.actorId,
    action_type: AuditActionType.data_export_completed,
    entity_type: AuditEntityType.data_export_job,
    entity_id: params.jobId,
    details: {
      merchant_id: params.merchantId,
      job_id: params.jobId,
      row_count: params.rowCount,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function logDataExportFailed(params: {
  actorId: string;
  merchantId: string;
  jobId: string;
  error: string;
}): Promise<any | null> {
  return await createAuditLog({
    admin_id: params.actorId,
    action_type: AuditActionType.data_export_failed,
    entity_type: AuditEntityType.data_export_job,
    entity_id: params.jobId,
    details: {
      merchant_id: params.merchantId,
      job_id: params.jobId,
      error: params.error.slice(0, 500),
      timestamp: new Date().toISOString(),
    },
  });
}

export async function logDataExportDownloaded(params: {
  actorId: string;
  merchantId: string;
  jobId: string;
  rowCount: number;
}): Promise<any | null> {
  return await createAuditLog({
    admin_id: params.actorId,
    action_type: AuditActionType.data_export_downloaded,
    entity_type: AuditEntityType.data_export_job,
    entity_id: params.jobId,
    details: {
      merchant_id: params.merchantId,
      job_id: params.jobId,
      row_count: params.rowCount,
      timestamp: new Date().toISOString(),
    },
  });
}
