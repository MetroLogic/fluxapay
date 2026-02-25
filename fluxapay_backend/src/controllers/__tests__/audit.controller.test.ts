import { getAuditLogs, getAuditLogByIdHandler } from '../audit.controller';
import { PrismaClient, AuditActionType, KYCStatus } from '../../generated/client';
import { logKycDecision, logConfigChange } from '../../services/audit.service';

const prisma = new PrismaClient();

// Mock response object
const mockResponse = () => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
};

// Mock authenticated admin request
const mockAdminRequest = (query: any = {}, params: any = {}): any => {
  return {
    query,
    params,
    user: { id: 'admin-123' },
  };
};

describe('Audit Controller', () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('getAuditLogs', () => {
    beforeEach(async () => {
      // Create test audit logs
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

    it('should return all audit logs', async () => {
      const req = mockAdminRequest();
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({ admin_id: expect.any(String) }),
          ]),
          pagination: expect.objectContaining({
            total: 3,
            page: 1,
            limit: 50,
          }),
        })
      );
    });

    it('should filter by admin_id', async () => {
      const req = mockAdminRequest({ admin_id: 'admin-1' });
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const call = (res.json as jest.Mock).mock.calls[0][0];
      expect(call.data).toHaveLength(2);
      expect(call.data.every((log: any) => log.admin_id === 'admin-1')).toBe(true);
    });

    it('should validate date_from format', async () => {
      const req = mockAdminRequest({ date_from: 'invalid-date' });
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });
  });

  describe('getAuditLogByIdHandler', () => {
    it('should return audit log by ID', async () => {
      const created = await logKycDecision({
        adminId: 'admin-123',
        merchantId: 'merchant-456',
        action: 'approve',
        previousStatus: KYCStatus.pending_review,
        newStatus: KYCStatus.approved,
      });

      const req = mockAdminRequest({}, { id: created!.id });
      const res = mockResponse();

      await getAuditLogByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: created!.id,
            admin_id: 'admin-123',
          }),
        })
      );
    });

    it('should return 404 for non-existent ID', async () => {
      const req = mockAdminRequest({}, { id: 'non-existent-id' });
      const res = mockResponse();

      await getAuditLogByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND',
          }),
        })
      );
    });
  });
});
