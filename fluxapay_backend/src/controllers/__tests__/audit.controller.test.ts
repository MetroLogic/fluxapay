import { getAuditLogs, getAuditLogByIdHandler } from '../audit.controller';
import { PrismaClient, AuditActionType, KYCStatus } from '../../generated/client';
import { logKycDecision, logConfigChange } from '../../services/audit.service';
import { AuthRequest } from '../../types/express';
import { Response } from 'express';

const prisma = new PrismaClient();

// Mock response object
const mockResponse = () => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Mock authenticated admin request
const mockAdminRequest = (query: any = {}, params: any = {}): AuthRequest => {
  return {
    query,
    params,
    user: { id: 'admin-123', role: 'admin' },
  } as AuthRequest;
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

    it('should filter by action_type', async () => {
      const req = mockAdminRequest({ action_type: AuditActionType.kyc_approve });
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const call = (res.json as jest.Mock).mock.calls[0][0];
      expect(call.data).toHaveLength(1);
      expect(call.data[0].action_type).toBe(AuditActionType.kyc_approve);
    });

    it('should support pagination', async () => {
      const req = mockAdminRequest({ page: '1', limit: '2' });
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const call = (res.json as jest.Mock).mock.calls[0][0];
      expect(call.data).toHaveLength(2);
      expect(call.pagination).toMatchObject({
        page: 1,
        limit: 2,
        totalPages: 2,
      });
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
            message: expect.stringContaining('date_from'),
          }),
        })
      );
    });

    it('should validate date_to format', async () => {
      const req = mockAdminRequest({ date_to: 'invalid-date' });
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('date_to'),
          }),
        })
      );
    });

    it('should validate date range', async () => {
      const req = mockAdminRequest({ date_from: '2024-12-31', date_to: '2024-01-01' });
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('date_from must be before date_to'),
          }),
        })
      );
    });

    it('should validate page parameter', async () => {
      const req = mockAdminRequest({ page: '0' });
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('page'),
          }),
        })
      );
    });

    it('should validate limit parameter', async () => {
      const req = mockAdminRequest({ limit: '200' });
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('limit'),
          }),
        })
      );
    });

    it('should validate action_type parameter', async () => {
      const req = mockAdminRequest({ action_type: 'invalid_action' });
      const res = mockResponse();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('action_type'),
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

    it('should validate ID parameter', async () => {
      const req = mockAdminRequest({}, { id: undefined });
      const res = mockResponse();

      await getAuditLogByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });
  });
});
