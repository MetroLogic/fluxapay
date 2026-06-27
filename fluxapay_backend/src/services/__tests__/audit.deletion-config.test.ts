import { AuditActionType, AuditEntityType } from '../../generated/client/client';

const auditLogCreate = jest.fn();
const auditLogCount = jest.fn();
const auditLogFindMany = jest.fn();

jest.mock('../../generated/client/client', () => ({
  PrismaClient: jest.fn(() => ({
    auditLog: {
      create: auditLogCreate,
      count: auditLogCount,
      findMany: auditLogFindMany,
    },
  })),
  AuditActionType: {
    merchant_deleted: 'merchant_deleted',
    config_updated: 'config_updated',
    kyc_approve: 'kyc_approve',
  },
  AuditEntityType: {
    merchant_account: 'merchant_account',
    system_config: 'system_config',
  },
}));

import {
  logConfigChange,
  logConfigUpdated,
  logMerchantDeleted,
  queryAuditLogs,
} from '../audit.service';

beforeEach(() => {
  jest.clearAllMocks();
  auditLogCreate.mockImplementation(({ data }) =>
    Promise.resolve({
      id: 'log-1',
      ...data,
      created_at: new Date(),
    }),
  );
});

describe('Audit Service — merchant deletion and config events', () => {
  describe('logMerchantDeleted', () => {
    it('creates merchant_deleted audit entry with actor and reason', async () => {
      const auditLog = await logMerchantDeleted({
        adminId: 'admin-99',
        merchantId: 'merchant-42',
        reason: 'account closure',
      });

      expect(auditLog.action_type).toBe(AuditActionType.merchant_deleted);
      expect(auditLog.entity_id).toBe('merchant-42');
      expect(auditLog.details).toMatchObject({
        merchant_id: 'merchant-42',
        actor: 'admin-99',
        reason: 'account closure',
      });
    });
  });

  describe('logConfigUpdated', () => {
    it('creates config_updated audit entry with field diff', async () => {
      const auditLog = await logConfigUpdated({
        adminId: 'admin-1',
        changedFields: ['settlement_fee_percent', 'webhook_max_retries'],
        oldValues: { settlement_fee_percent: '2.0', webhook_max_retries: '5' },
        newValues: { settlement_fee_percent: '2.5', webhook_max_retries: '7' },
      });

      expect(auditLog.action_type).toBe(AuditActionType.config_updated);
      expect(auditLog.entity_type).toBe(AuditEntityType.system_config);
      expect(auditLog.details).toMatchObject({
        changed_fields: ['settlement_fee_percent', 'webhook_max_retries'],
        old_values: { settlement_fee_percent: '2.0', webhook_max_retries: '5' },
        new_values: { settlement_fee_percent: '2.5', webhook_max_retries: '7' },
      });
    });

    it('logConfigChange delegates to config_updated', async () => {
      const auditLog = await logConfigChange({
        adminId: 'admin-1',
        configKey: 'settlement_fee_percent',
        previousValue: '2.0',
        newValue: '2.5',
      });

      expect(auditLog.action_type).toBe(AuditActionType.config_updated);
    });
  });

  describe('queryAuditLogs event_type filter', () => {
    it('accepts eventType as alias for actionType in params', async () => {
      auditLogCount.mockResolvedValue(1);
      auditLogFindMany.mockResolvedValue([
        { id: '1', action_type: AuditActionType.merchant_deleted },
      ]);

      const result = await queryAuditLogs({ eventType: AuditActionType.merchant_deleted });
      expect(auditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action_type: AuditActionType.merchant_deleted },
        }),
      );
      expect(result.logs).toHaveLength(1);
    });
  });
});
