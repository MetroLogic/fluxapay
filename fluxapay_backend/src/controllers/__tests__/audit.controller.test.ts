import request from 'supertest';
import { app } from '../../app';
import { PrismaClient, AuditActionType, KYCStatus } from '../../generated/client';
import { logKycDecision, logConfigChange } from '../../services/audit.service';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Helper to generate admin JWT token
function generateAdminToken(adminId: string): string {
  return jwt.sign(
    { id: adminId, role: 'admin' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

// Helper to generate merchant JWT token (non-admin)
function generateMerchantToken(merchantId: string): string {
  return jwt.sign(
    { id: merchantId, role: 'merchant' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Audit Controller', () => {
  let adminToken: string;
  let merchantToken: string;

  beforeAll(() => {
    adminToken = generateAdminToken('admin-123');
    merchantToken = generateMerchantToken('merchant-123');
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/admin/audit-logs', () => {
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

    it('should return all audit logs for admin user', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toMatchObject({
        total: 3,
        page: 1,
        limit: 50,
      });
    });

    it('should filter by admin_id', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?admin_id=admin-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((log: any) => log.admin_id === 'admin-1')).toBe(true);
    });

    it('should filter by action_type', async () => {
      const response = await request(app)
        .get(`/api/admin/audit-logs?action_type=${AuditActionType.kyc_approve}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].action_type).toBe(AuditActionType.kyc_approve);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 2,
        totalPages: 2,
      });
    });

    it('should reject request without JWT token', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject request without admin privileges', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should validate date_from format', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?date_from=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('date_from');
    });

    it('should validate date_to format', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?date_to=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('date_to');
    });

    it('should validate date range', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?date_from=2024-12-31&date_to=2024-01-01')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('date_from must be before date_to');
    });

    it('should validate page parameter', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?page=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('page');
    });

    it('should validate limit parameter', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?limit=200')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('limit');
    });

    it('should validate action_type parameter', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?action_type=invalid_action')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('action_type');
    });
  });

  describe('GET /api/admin/audit-logs/:id', () => {
    it('should return audit log by ID', async () => {
      const created = await logKycDecision({
        adminId: 'admin-123',
        merchantId: 'merchant-456',
        action: 'approve',
        previousStatus: KYCStatus.pending_review,
        newStatus: KYCStatus.approved,
      });

      const response = await request(app)
        .get(`/api/admin/audit-logs/${created!.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(created!.id);
      expect(response.body.data.admin_id).toBe('admin-123');
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject request without JWT token', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs/some-id')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject request without admin privileges', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs/some-id')
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
