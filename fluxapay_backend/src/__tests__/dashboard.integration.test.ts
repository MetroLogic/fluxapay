import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

describe('Dashboard API Integration Tests', () => {
  let token: string;
  const merchantId = 'test-merchant-id';

  beforeAll(() => {
    // Generate a valid JWT for testing
    token = jwt.sign({ id: merchantId, email: 'test@merchant.com' }, JWT_SECRET);
    process.env.JWT_SECRET = JWT_SECRET;
  });

  describe('GET /api/v1/dashboard/overview/metrics', () => {
    it('should return dashboard metrics with 201 status', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/overview/metrics')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Dashboard overview recovered');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('revenue');
      expect(response.body.data).toHaveProperty('payments');
      expect(response.body.data).toHaveProperty('success_rate');
    });

    it('should return 401 if token is missing', async () => {
      const response = await request(app).get('/api/v1/dashboard/overview/metrics');
      expect(response.status).toBe(401);
    });

    it('should return 403 if token is invalid', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/overview/metrics')
        .set('Authorization', 'Bearer invalid-token');
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/dashboard/overview/charts', () => {
    it('should return analytics chart data with 201 status', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/overview/charts')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Dashboard analytics recovered');
      expect(response.body.data).toHaveProperty('volume_over_time');
      expect(response.body.data).toHaveProperty('status_breakdown');
      expect(response.body.data).toHaveProperty('revenue_trend');
    });
  });

  describe('GET /api/v1/dashboard/overview/activity', () => {
    it('should return activity log with 201 status', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/overview/activity')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Dashboard activity recovered');
      expect(response.body.data).toHaveProperty('recent_payments');
      expect(response.body.data).toHaveProperty('recent_settlements');
      expect(response.body.data).toHaveProperty('failed_alerts');
    });
  });
});
