import { AuditActionType, AuditEntityType, KYCStatus } from '../generated/client';

export interface AuditLog {
  id: string;
  admin_id: string;
  action_type: AuditActionType;
  entity_type: AuditEntityType;
  entity_id: string;
  details: Record<string, any>;
  created_at: Date;
}

export interface CreateAuditLogParams {
  admin_id: string;
  action_type: AuditActionType;
  entity_type: AuditEntityType;
  entity_id: string;
  details: Record<string, any>;
}

export interface QueryAuditLogsParams {
  dateFrom?: Date;
  dateTo?: Date;
  adminId?: string;
  actionType?: AuditActionType;
  entityId?: string;
  page?: number;
  limit?: number;
}

export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Detail interfaces for specific audit actions

export interface KycDecisionDetails {
  merchant_id: string;
  previous_status: KYCStatus;
  new_status: KYCStatus;
  reason?: string;
  reviewed_at: string;
}

export interface ConfigChangeDetails {
  config_key: string;
  previous_value: string;
  new_value: string;
  is_sensitive: boolean;
}

export interface SweepOperationDetails {
  sweep_type: string;
  trigger_reason: string;
  status?: 'completed' | 'failed';
  statistics?: {
    addresses_swept: number;
    total_amount: string;
    transaction_hash?: string;
  };
  failure_reason?: string;
}

export interface SettlementBatchDetails {
  batch_id: string;
  initiation_reason: string;
  status?: 'completed' | 'failed';
  transaction_count?: number;
  total_amount?: number;
  currency?: string;
  completed_at?: string;
  failure_reason?: string;
}
