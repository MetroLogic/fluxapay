import { PrismaClient, AuditActionType, AuditEntityType, KYCStatus } from '../../generated/client';
import {
  logKycDecision,
  logConfigChange,
  logSweepTrigger,
  updateSweepCompletion,
  logSettlementBatch,
  updateSettlementBatchCompletion,
  queryAuditLogs,
  getAuditLogById,
} from '../audit.service';

const prisma = new PrismaClient();

describe('Audit Service', () => {
  beforeEach(async () => {
    // Clean up audit logs before each test
    await prisma.auditLog.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('logKycDecision', () => {
    it('should create audit entry for KYC approval', async () => {
      const params = {
        adminId: 'admin-123',
        merchantId: 'merchant-456',
        action: 'approve' as const,
        previousStatus: KYCStatus.pending_review,
        newStatus: KYCStatus.approved,
        reason: 'All documents verified',
      };

      const auditLog = await logKycDecision(params);

      expect(auditLog).toBeDefined();
      expect(auditLog?.id).toBeDefined();
      expect(auditLog?.admin_id).toBe('admin-123');
      expect(auditLog?.entity_id).toBe('merchant-456');
      expect(auditLog?.action_type).toBe(AuditActionType.kyc_approve);
      expect(auditLog?.entity_type).toBe(AuditEntityType.merchant_kyc);
      expect(auditLog?.details).toMatchObject({
        merchant_id: 'merchant-456',
        previous_status: KYCStatus.pending_review,
        new_status: KYCStatus.approved,
        reason: 'All documents verified',
      });
    });

    it('should create audit entry for KYC rejection', async () => {
      const params = {
        adminId: 'admin-123',
        merchantId: 'merchant-456',
        action: 'reject' as const,
        previousStatus: KYCStatus.pending_review,
        newStatus: KYCStatus.rejected,
        reason: 'Incomplete documents',
      };

      const auditLog = await logKycDecision(params);

      expect(auditLog?.action_type).toBe(AuditActionType.kyc_reject);
      expect(auditLog?.details).toMatchObject({
        reason: 'Incomplete documents',
      });
    });

    it('should handle missing reason gracefully', async () => {
      const params = {
        adminId: 'admin-123',
        merchantId: 'merchant-456',
        action: 'approve' as const,
        previousStatus: KYCStatus.pending_review,
        newStatus: KYCStatus.approved,
      };

      const auditLog = await logKycDecision(params);

      expect(auditLog?.details.reason).toBeUndefined();
    });
  });

  describe('logConfigChange', () => {
    it('should create audit entry for config change', async () => {
      const params = {
        adminId: 'admin-123',
        configKey: 'settlement_fee_percent',
        previousValue: '2.0',
        newValue: '2.5',
      };

      const auditLog = await logConfigChange(params);

      expect(auditLog).toBeDefined();
      expect(auditLog?.action_type).toBe(AuditActionType.config_change);
      expect(auditLog?.entity_type).toBe(AuditEntityType.system_config);
      expect(auditLog?.entity_id).toBe('settlement_fee_percent');
      expect(auditLog?.details).toMatchObject({
        config_key: 'settlement_fee_percent',
        previous_value: '2.0',
        new_value: '2.5',
        is_sensitive: false,
      });
    });

    it('should redact sensitive configuration values', async () => {
      const params = {
        adminId: 'admin-123',
        configKey: 'api_secret_key',
        previousValue: 'old-secret-123',
        newValue: 'new-secret-456',
        isSensitive: true,
      };

      const auditLog = await logConfigChange(params);

      expect(auditLog?.details.previous_value).toBe('***REDACTED***');
      expect(auditLog?.details.new_value).toBe('***REDACTED***');
      expect(auditLog?.details.is_sensitive).toBe(true);
    });
  });

  describe('logSweepTrigger and updateSweepCompletion', () => {
    it('should create audit entry for sweep trigger', async () => {
      const params = {
        adminId: 'admin-123',
        sweepType: 'manual',
        reason: 'Emergency sweep requested',
      };

      const auditLog = await logSweepTrigger(params);

      expect(auditLog).toBeDefined();
      expect(auditLog?.action_type).toBe(AuditActionType.sweep_trigger);
      expect(auditLog?.entity_type).toBe(AuditEntityType.sweep_operation);
      expect(auditLog?.details).toMatchObject({
        sweep_type: 'manual',
        trigger_reason: 'Emergency sweep requested',
      });
    });

    it('should update sweep completion with statistics', async () => {
      const triggerLog = await logSweepTrigger({
        adminId: 'admin-123',
        sweepType: 'manual',
        reason: 'Test sweep',
      });

      const updatedLog = await updateSweepCompletion({
        auditLogId: triggerLog!.id,
        status: 'completed',
        statistics: {
          addresses_swept: 5,
          total_amount: '1000.50',
          transaction_hash: '0xabc123',
        },
      });

      expect(updatedLog?.action_type).toBe(AuditActionType.sweep_complete);
      expect(updatedLog?.details.status).toBe('completed');
      expect(updatedLog?.details.statistics).toMatchObject({
        addresses_swept: 5,
        total_amount: '1000.50',
        transaction_hash: '0xabc123',
      });
    });

    it('should update sweep failure with reason', async () => {
      const triggerLog = await logSweepTrigger({
        adminId: 'admin-123',
        sweepType: 'manual',
        reason: 'Test sweep',
      });

      const updatedLog = await updateSweepCompletion({
        auditLogId: triggerLog!.id,
        status: 'failed',
        failureReason: 'Insufficient gas',
      });

      expect(updatedLog?.action_type).toBe(AuditActionType.sweep_fail);
      expect(updatedLog?.details.status).toBe('failed');
      expect(updatedLog?.details.failure_reason).toBe('Insufficient gas');
    });
  });

  describe('logSettlementBatch and updateSettlementBatchCompletion', () => {
    it('should create audit entry for settlement batch', async () => {
      const params = {
        adminId: 'admin-123',
        batchId: 'batch_1234567890',
        reason: 'Scheduled daily settlement',
      };

      const auditLog = await logSettlementBatch(params);

      expect(auditLog).toBeDefined();
      expect(auditLog?.action_type).toBe(AuditActionType.settlement_batch_initiate);
      expect(auditLog?.entity_type).toBe(AuditEntityType.settlement_batch);
      expect(auditLog?.entity_id).toBe('batch_1234567890');
      expect(auditLog?.details).toMatchObject({
        batch_id: 'batch_1234567890',
        initiation_reason: 'Scheduled daily settlement',
      });
    });

    it('should update settlement batch completion', async () => {
      const batchLog = await logSettlementBatch({
        adminId: 'admin-123',
        batchId: 'batch_1234567890',
        reason: 'Test batch',
      });

      const updatedLog = await updateSettlementBatchCompletion({
        auditLogId: batchLog!.id,
        status: 'completed',
        transactionCount: 10,
        totalAmount: 5000.75,
        currency: 'USD',
      });

      expect(updatedLog?.action_type).toBe(AuditActionType.settlement_batch_complete);
      expect(updatedLog?.details.status).toBe('completed');
      expect(updatedLog?.details.transaction_count).toBe(10);
      expect(updatedLog?.details.total_amount).toBe(5000.75);
      expect(updatedLog?.details.currency).toBe('USD');
    });

    it('should update settlement batch failure', async () => {
      const batchLog = await logSettlementBatch({
        adminId: 'admin-123',
        batchId: 'batch_1234567890',
        reason: 'Test batch',
      });

      const updatedLog = await updateSettlementBatchCompletion({
        auditLogId: batchLog!.id,
        status: 'failed',
        failureReason: 'Exchange API unavailable',
      });

      expect(updatedLog?.action_type).toBe(AuditActionType.settlement_batch_fail);
      expect(updatedLog?.details.status).toBe('failed');
      expect(updatedLog?.details.failure_reason).toBe('Exchange API unavailable');
    });
  });

  describe('queryAuditLogs', () => {
    beforeEach(async () => {
      // Create test data
      await logKycDecision({
        adminId: 'admin-1',
        merchantId: 'merchant-1',
        action: 'approve',
        previousStatus: KYCStatus.pending_review,
        newStatus: KYCStatus.approved,
      });

      await logKycDecision({
        adminId: 'admin-2',
        merchantId: 'merchant-2',
        action: 'reject',
        previousStatus: KYCStatus.pending_review,
        newStatus: KYCStatus.rejected,
      });

      await logConfigChange({
        adminId: 'admin-1',
        configKey: 'test_config',
        previousValue: 'old',
        newValue: 'new',
      });
    });

    it('should return all audit logs without filters', async () => {
      const result = await queryAuditLogs({});

      expect(result.logs.length).toBe(3);
      expect(result.pagination.total).toBe(3);
    });

    it('should filter by admin ID', async () => {
      const result = await queryAuditLogs({ adminId: 'admin-1' });

      expect(result.logs.length).toBe(2);
      expect(result.logs.every(log => log.admin_id === 'admin-1')).toBe(true);
    });

    it('should filter by action type', async () => {
      const result = await queryAuditLogs({ actionType: AuditActionType.kyc_approve });

      expect(result.logs.length).toBe(1);
      expect(result.logs[0].action_type).toBe(AuditActionType.kyc_approve);
    });

    it('should support pagination', async () => {
      const result = await queryAuditLogs({ page: 1, limit: 2 });

      expect(result.logs.length).toBe(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.totalPages).toBe(2);
    });

    it('should return logs in descending order by created_at', async () => {
      const result = await queryAuditLogs({});

      for (let i = 0; i < result.logs.length - 1; i++) {
        expect(result.logs[i].created_at.getTime()).toBeGreaterThanOrEqual(
          result.logs[i + 1].created_at.getTime()
        );
      }
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const result = await queryAuditLogs({
        dateFrom: yesterday,
        dateTo: tomorrow,
      });

      expect(result.logs.length).toBe(3);
    });
  });

  describe('getAuditLogById', () => {
    it('should return audit log by ID', async () => {
      const created = await logKycDecision({
        adminId: 'admin-123',
        merchantId: 'merchant-456',
        action: 'approve',
        previousStatus: KYCStatus.pending_review,
        newStatus: KYCStatus.approved,
      });

      const fetched = await getAuditLogById(created!.id);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created!.id);
      expect(fetched?.admin_id).toBe('admin-123');
    });

    it('should return null for non-existent ID', async () => {
      const fetched = await getAuditLogById('non-existent-id');

      expect(fetched).toBeNull();
    });
  });
});
