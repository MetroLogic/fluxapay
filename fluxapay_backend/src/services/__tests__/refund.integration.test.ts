import { createRefundService, updateRefundStatusService } from '../refund.service';
import { PrismaClient } from '../../generated/client/client';

const prisma = new PrismaClient();

function uniquePhone(): string {
  return `+1${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

describe('Refund Service - Integration Tests', () => {
  beforeEach(async () => {
    await prisma.refund.deleteMany({
      where: { merchantId: { in: ['int-test-merchant', 'int-test-merchant-2'] } },
    });
    await prisma.payment.deleteMany({
      where: { merchantId: { in: ['int-test-merchant', 'int-test-merchant-2'] } },
    });
    await prisma.merchant.deleteMany({
      where: { id: { in: ['int-test-merchant', 'int-test-merchant-2'] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('End-to-end refund workflow', () => {
    beforeEach(async () => {
      await prisma.merchant.create({
        data: {
          id: 'int-test-merchant',
          business_name: 'Integration Test Merchant',
          email: 'int-test@example.com',
          phone_number: uniquePhone(),
          country: 'US',
          settlement_currency: 'USD',
          webhook_secret: 'secret',
          password: 'hashed_password',
        },
      });
    });

    it('should complete full refund workflow: create → process → complete', async () => {
      const payment = await prisma.payment.create({
        data: {
          id: 'int-test-payment-1',
          merchantId: 'int-test-merchant',
          amount: 250,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      // Step 1: Create refund
      const refundResult = await createRefundService({
        merchantId: 'int-test-merchant',
        payment_id: payment.id,
        amount: 100,
        reason: 'Customer request',
      });

      expect(refundResult.data.status).toBe('pending');
      const refundId = refundResult.data.id;

      // Step 2: Update status to processing
      const processingResult = await updateRefundStatusService({
        merchantId: 'int-test-merchant',
        refund_id: refundId,
        status: 'processing',
      });

      expect(processingResult.data.status).toBe('processing');

      // Step 3: Complete refund
      const completedResult = await updateRefundStatusService({
        merchantId: 'int-test-merchant',
        refund_id: refundId,
        status: 'completed',
      });

      expect(completedResult.data.status).toBe('completed');
    });

    it('should handle multiple partial refunds and track cumulative amount', async () => {
      const payment = await prisma.payment.create({
        data: {
          id: 'int-test-payment-2',
          merchantId: 'int-test-merchant',
          amount: 500,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      // Create multiple partial refunds
      const refund1 = await createRefundService({
        merchantId: 'int-test-merchant',
        payment_id: payment.id,
        amount: 150,
        reason: 'Partial refund 1',
      });

      const refund2 = await createRefundService({
        merchantId: 'int-test-merchant',
        payment_id: payment.id,
        amount: 200,
        reason: 'Partial refund 2',
      });

      // Update first refund to completed
      await updateRefundStatusService({
        merchantId: 'int-test-merchant',
        refund_id: refund1.data.id,
        status: 'completed',
      });

      // Verify we can only refund remaining amount
      await expect(
        createRefundService({
          merchantId: 'int-test-merchant',
          payment_id: payment.id,
          amount: 200, // 150 + 200 + 200 = 550 > 500
        })
      ).rejects.toMatchObject({
        status: 422,
      });

      // But 150 should be allowed (150 + 200 + 150 = 500)
      const refund3 = await createRefundService({
        merchantId: 'int-test-merchant',
        payment_id: payment.id,
        amount: 150,
        reason: 'Partial refund 3',
      });

      expect(refund3.data.status).toBe('pending');
    });

    it('should handle failure scenario and retry', async () => {
      const payment = await prisma.payment.create({
        data: {
          id: 'int-test-payment-3',
          merchantId: 'int-test-merchant',
          amount: 300,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      // Create refund
      const refundResult = await createRefundService({
        merchantId: 'int-test-merchant',
        payment_id: payment.id,
        amount: 100,
        reason: 'Test refund',
      });

      // Mark as failed
      const failedResult = await updateRefundStatusService({
        merchantId: 'int-test-merchant',
        refund_id: refundResult.data.id,
        status: 'failed',
        failed_reason: 'Insufficient balance',
      });

      expect(failedResult.data.status).toBe('failed');
      expect(failedResult.data.failed_reason).toBe('Insufficient balance');

      // Create a new refund for the same amount (since failed refund doesn't count)
      const retryResult = await createRefundService({
        merchantId: 'int-test-merchant',
        payment_id: payment.id,
        amount: 100,
        reason: 'Retry refund',
      });

      expect(retryResult.data.status).toBe('pending');
      expect(retryResult.data.id).not.toBe(refundResult.data.id);
    });
  });

  describe('Concurrent refund scenario', () => {
    beforeEach(async () => {
      await prisma.merchant.create({
        data: {
          id: 'int-test-merchant-2',
          business_name: 'Concurrent Test Merchant',
          email: 'concurrent-test@example.com',
          phone_number: uniquePhone(),
          country: 'US',
          settlement_currency: 'USD',
          webhook_secret: 'secret',
          password: 'hashed_password',
        },
      });
    });

    it('should prevent race condition where cumulative refunds exceed payment', async () => {
      const payment = await prisma.payment.create({
        data: {
          id: 'int-test-payment-4',
          merchantId: 'int-test-merchant-2',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      // Simulate concurrent requests
      const promises = [
        createRefundService({
          merchantId: 'int-test-merchant-2',
          payment_id: payment.id,
          amount: 50,
        }),
        createRefundService({
          merchantId: 'int-test-merchant-2',
          payment_id: payment.id,
          amount: 50,
        }),
        createRefundService({
          merchantId: 'int-test-merchant-2',
          payment_id: payment.id,
          amount: 50,
        }),
      ];

      const results = await Promise.allSettled(promises);

      // At least one should succeed, but not all three
      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(successful.length).toBeGreaterThan(0);
      expect(successful.length + failed.length).toBe(3);
      expect(failed.length).toBeGreaterThan(0);

      // Failed requests should have 422 status
      for (const result of failed) {
        if (result.status === 'rejected') {
          expect(result.reason.status).toBe(422);
        }
      }
    });
  });
});
