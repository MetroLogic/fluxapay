/**
 * OpenAPI Contract Tests
 * 
 * These tests verify that API responses match the documented OpenAPI specification.
 * They ensure consistency between documentation and actual implementation.
 * 
 * Priority Areas:
 * 1. Payments API
 * 2. Merchants API  
 * 3. Webhooks API
 */

import request from 'supertest';
import express from 'express';
import { loadDereferencedSpec, assertMatchesSpec } from '../helpers/openapi-validator';
import { PrismaClient } from '../../generated/client/client';
import { specs } from '../../docs/swagger';

// Import routes
import paymentRoutes from '../../routes/payment.route';
import merchantRoutes from '../../routes/merchant.route';
import webhookRoutes from '../../routes/webhook.route';

const prisma = new PrismaClient();

// Test configuration
const API_BASE_PATH = '/api/v1';
let app: express.Express;
let testServer: any;
let testApiKey: string;
let testMerchantId: string;

/**
 * Setup test server and authentication
 */
beforeAll(async () => {
  // Create Express app
  app = express();
  app.use(express.json());
  
  // Add routes
  app.use(`${API_BASE_PATH}/payments`, paymentRoutes);
  app.use(`${API_BASE_PATH}/merchants`, merchantRoutes);
  app.use(`${API_BASE_PATH}/webhooks`, webhookRoutes);

  // Start test server
  await new Promise<void>((resolve) => {
    testServer = app.listen(0, () => {
      resolve();
    });
  });

  // Get test merchant or create one
  const testMerchant = await prisma.merchant.findFirst({
    where: { email: 'test-contract@example.com' },
  });

  if (testMerchant) {
    testMerchantId = testMerchant.id;
    testApiKey = testMerchant.api_key || 'test_key';
  } else {
    // Create test merchant
    const created = await prisma.merchant.create({
      data: {
        email: 'test-contract@example.com',
        business_name: 'Test Business',
        api_key_hashed: 'test_hash',
        api_key_last_four: 'test',
        webhook_secret: 'whsec_test',
      },
    });
    testMerchantId = created.id;
    testApiKey = 'test_key';
  }
});

/**
 * Cleanup after tests
 */
afterAll(async () => {
  if (testServer) {
    testServer.close();
  }
  await prisma.$disconnect();
});

/**
 * Get server address
 */
function getServerUrl(): string {
  const address = testServer?.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  return `http://localhost:${port}`;
}

/**
 * Get auth headers
 */
function getAuthHeaders(): Record<string, string> {
  return {
    'x-api-key': testApiKey,
    'Content-Type': 'application/json',
  };
}

/**
 * Normalize path for validation (replace dynamic params with spec format)
 */
function normalizePath(path: string): string {
  // Replace /pay_123 with /{id}
  return path
    .replace(/\/pay_[a-zA-Z0-9]+/g, '/{id}')
    .replace(/\/refund_[a-zA-Z0-9]+/g, '/{id}')
    .replace(/\/whevt_[a-zA-Z0-9]+/g, '/{id}');
}

describe('OpenAPI Contract Tests', () => {
  describe('Payments API', () => {
    let createdPaymentId: string;

    describe('POST /api/v1/payments', () => {
      it('should create a payment and match response schema', async () => {
        const paymentData = {
          amount: 100.5,
          currency: 'USDC',
          customer_email: 'customer@example.com',
          metadata: { order_id: 'test_order_001' },
        };

        const response = await request(getServerUrl())
          .post(`${API_BASE_PATH}/payments`)
          .set(getAuthHeaders())
          .send(paymentData);

        expect(response.status).toBe(201);
        expect(response.body).toBeDefined();
        
        // Store payment ID for later tests
        createdPaymentId = response.body.id;

        // Validate against OpenAPI spec
        await assertMatchesSpec(
          `${API_BASE_PATH}/payments`,
          'POST',
          response.status,
          response.body
        );
      });

      it('should return 422 for invalid payment data', async () => {
        const invalidData = {
          amount: -100, // Invalid: negative amount
          currency: 'INVALID',
        };

        const response = await request(getServerUrl())
          .post(`${API_BASE_PATH}/payments`)
          .set(getAuthHeaders())
          .send(invalidData);

        // Should be 422 or 400 for validation error
        expect([400, 422]).toContain(response.status);

        await assertMatchesSpec(
          `${API_BASE_PATH}/payments`,
          'POST',
          response.status,
          response.body
        );
      });

      it('should return 401 without API key', async () => {
        const paymentData = {
          amount: 50,
          currency: 'USDC',
          customer_email: 'test@example.com',
        };

        const response = await request(getServerUrl())
          .post(`${API_BASE_PATH}/payments`)
          .send(paymentData);

        expect(response.status).toBe(401);

        await assertMatchesSpec(
          `${API_BASE_PATH}/payments`,
          'POST',
          response.status,
          response.body
        );
      });
    });

    describe('GET /api/v1/payments', () => {
      it('should list payments and match response schema', async () => {
        const response = await request(getServerUrl())
          .get(`${API_BASE_PATH}/payments`)
          .set(getAuthHeaders());

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        await assertMatchesSpec(
          `${API_BASE_PATH}/payments`,
          'GET',
          response.status,
          response.body
        );
      });

      it('should support pagination parameters', async () => {
        const response = await request(getServerUrl())
          .get(`${API_BASE_PATH}/payments`)
          .set(getAuthHeaders())
          .query({ page: 1, limit: 10 });

        expect(response.status).toBe(200);

        await assertMatchesSpec(
          `${API_BASE_PATH}/payments`,
          'GET',
          response.status,
          response.body
        );
      });
    });

    describe('GET /api/v1/payments/:id', () => {
      it('should get payment by ID and match schema', async () => {
        // First create a payment
        const createResponse = await request(getServerUrl())
          .post(`${API_BASE_PATH}/payments`)
          .set(getAuthHeaders())
          .send({
            amount: 75.25,
            currency: 'USDC',
            customer_email: 'buyer@example.com',
          });

        const paymentId = createResponse.body.id;

        const response = await request(getServerUrl())
          .get(`${API_BASE_PATH}/payments/${paymentId}`)
          .set(getAuthHeaders());

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(paymentId);

        await assertMatchesSpec(
          `${API_BASE_PATH}/payments/{id}`,
          'GET',
          response.status,
          response.body
        );
      });

      it('should return 404 for non-existent payment', async () => {
        const response = await request(getServerUrl())
          .get(`${API_BASE_PATH}/payments/pay_nonexistent`)
          .set(getAuthHeaders());

        expect(response.status).toBe(404);

        await assertMatchesSpec(
          `${API_BASE_PATH}/payments/{id}`,
          'GET',
          response.status,
          response.body
        );
      });
    });

    describe('GET /api/v1/payments/:id/status', () => {
      it('should get public payment status', async () => {
        // Create a payment first
        const createResponse = await request(getServerUrl())
          .post(`${API_BASE_PATH}/payments`)
          .set(getAuthHeaders())
          .send({
            amount: 25,
            currency: 'USDC',
            customer_email: 'public@example.com',
          });

        const paymentId = createResponse.body.id;

        const response = await request(getServerUrl())
          .get(`${API_BASE_PATH}/payments/${paymentId}/status`);

        expect(response.status).toBe(200);

        await assertMatchesSpec(
          `${API_BASE_PATH}/payments/{id}/status`,
          'GET',
          response.status,
          response.body
        );
      });
    });
  });

  describe('Merchants API', () => {
    describe('GET /api/v1/merchants/me', () => {
      it('should get current merchant info', async () => {
        const response = await request(getServerUrl())
          .get(`${API_BASE_PATH}/merchants/me`)
          .set(getAuthHeaders());

        expect(response.status).toBe(200);

        await assertMatchesSpec(
          `${API_BASE_PATH}/merchants/me`,
          'GET',
          response.status,
          response.body
        );
      });

      it('should return 401 without authentication', async () => {
        const response = await request(getServerUrl())
          .get(`${API_BASE_PATH}/merchants/me`);

        expect(response.status).toBe(401);

        await assertMatchesSpec(
          `${API_BASE_PATH}/merchants/me`,
          'GET',
          response.status,
          response.body
        );
      });
    });

    describe('POST /api/v1/merchants/kyc', () => {
      it('should submit KYC information', async () => {
        const kycData = {
          business_type: 'individual',
          business_address: {
            line1: '123 Test St',
            city: 'Test City',
            state: 'TS',
            postal_code: '12345',
            country: 'US',
          },
          representative: {
            first_name: 'John',
            last_name: 'Doe',
            date_of_birth: '1990-01-01',
          },
        };

        const response = await request(getServerUrl())
          .post(`${API_BASE_PATH}/merchants/kyc`)
          .set(getAuthHeaders())
          .send(kycData);

        // Should be 200, 201, or 422 for validation
        expect([200, 201, 422, 400]).toContain(response.status);

        await assertMatchesSpec(
          `${API_BASE_PATH}/merchants/kyc`,
          'POST',
          response.status,
          response.body
        );
      });
    });
  });

  describe('Webhooks API', () => {
    describe('GET /api/v1/webhooks/events', () => {
      it('should list webhook events', async () => {
        const response = await request(getServerUrl())
          .get(`${API_BASE_PATH}/webhooks/events`)
          .set(getAuthHeaders());

        expect(response.status).toBe(200);

        await assertMatchesSpec(
          `${API_BASE_PATH}/webhooks/events`,
          'GET',
          response.status,
          response.body
        );
      });

      it('should support filtering by payment_id', async () => {
        const response = await request(getServerUrl())
          .get(`${API_BASE_PATH}/webhooks/events`)
          .set(getAuthHeaders())
          .query({ payment_id: 'test_payment' });

        expect(response.status).toBe(200);

        await assertMatchesSpec(
          `${API_BASE_PATH}/webhooks/events`,
          'GET',
          response.status,
          response.body
        );
      });
    });

    describe('POST /api/v1/webhooks/events/:id/redeliver', () => {
      it('should attempt to redeliver webhook', async () => {
        // This might fail with 404 if no events exist, but should still validate
        const response = await request(getServerUrl())
          .post(`${API_BASE_PATH}/webhooks/events/whevt_test/redeliver`)
          .set(getAuthHeaders());

        // Could be 200, 404, or other valid error
        expect([200, 404, 400]).toContain(response.status);

        await assertMatchesSpec(
          `${API_BASE_PATH}/webhooks/events/{id}/redeliver`,
          'POST',
          response.status,
          response.body
        );
      });
    });
  });

  describe('Error Response Contracts', () => {
    it('should return consistent error format for 401', async () => {
      const response = await request(getServerUrl())
        .get(`${API_BASE_PATH}/payments`)
        .set({ 'x-api-key': 'invalid_key' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');

      await assertMatchesSpec(
        `${API_BASE_PATH}/payments`,
        'GET',
        response.status,
        response.body
      );
    });

    it('should return consistent error format for malformed requests', async () => {
      const response = await request(getServerUrl())
        .post(`${API_BASE_PATH}/payments`)
        .set(getAuthHeaders())
        .send('invalid json');

      // Should be 400 or 422
      expect([400, 422]).toContain(response.status);

      await assertMatchesSpec(
        `${API_BASE_PATH}/payments`,
        'POST',
        response.status,
        response.body
      );
    });
  });
});
