import { createRefundService } from '../refund.service';
import { PrismaClient } from '../../generated/client/client';

const prisma = new PrismaClient();

describe('Refund Service - Validation', () => {
  // Test data cleanup
  beforeEach(async () => {
    // Clean up test data before each test
    await prisma.refund.deleteMany({ where: { merchantId: 'test-merchant' } });
    await prisma.payment.deleteMany({ where: { merchantId: 'test-merchant' } });
    await prisma.merchant.deleteMany({ where: { id: 'test-merchant' } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Payment Ownership Validation', () => {
    it('should create refund when payment belongs to merchant', async () => {
      // Create test merchant
      await prisma.merchant.create({
        data: {
          id: 'test-merchant',
          business_name: 'Test Merchant',
          email: 'test@example.com',
          phone_number: '+1234567890',
          country: 'US',
          settlement_currency: 'USD',
          webhook_secret: 'secret',
          password: 'hashed_password',
        },
      });

      // Create confirmed payment
      await prisma.payment.create({
        data: {
          id: 'test-payment-1',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000), // 24 hours from now
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment-1',
        amount: 50,
        reason: 'Customer request',
      });

      expect(result.message).toBe('Refund created successfully');
      expect(result.data).toMatchObject({
        merchantId: 'test-merchant',
        paymentId: 'test-payment-1',
        amount: 50,
        status: 'pending',
      });
    });

    it('should reject refund when payment does not belong to merchant', async () => {
      // Create different merchant
      await prisma.merchant.create({
        data: {
          id: 'other-merchant',
          business_name: 'Other Merchant',
          email: 'other@example.com',
          phone_number: '+0987654321',
          country: 'US',
          settlement_currency: 'USD',
          webhook_secret: 'secret',
          password: 'hashed_password',
        },
      });

      // Create payment for different merchant
      await prisma.payment.create({
        data: {
          id: 'other-payment',
          merchantId: 'other-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'other-payment',
          amount: 50,
        })
      ).rejects.toMatchObject({
        status: 403,
        message: 'Payment does not belong to your merchant account',
      });
    });

    it('should reject refund when payment does not exist', async () => {
      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'non-existent-payment',
          amount: 50,
        })
      ).rejects.toMatchObject({
        status: 404,
        message: 'Payment not found',
      });
    });
  });

  describe('Payment Status Validation', () => {
    beforeEach(async () => {
      await prisma.merchant.create({
        data: {
          id: 'test-merchant',
          business_name: 'Test Merchant',
          email: 'test@example.com',
          phone_number: '+1234567890',
          country: 'US',
          settlement_currency: 'USD',
          webhook_secret: 'secret',
          password: 'hashed_password',
        },
      });
    });

    it('should allow refund for confirmed payment', async () => {
      await prisma.payment.create({
        data: {
          id: 'confirmed-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'confirmed-payment',
        amount: 50,
      });

      expect(result.message).toBe('Refund created successfully');
    });

    it('should allow refund for overpaid payment', async () => {
      await prisma.payment.create({
        data: {
          id: 'overpaid-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'overpaid',
          checkout_url: 'https://example.com/checkout',
        },
      });

      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'overpaid-payment',
        amount: 50,
      });

      expect(result.message).toBe('Refund created successfully');
    });

    it('should reject refund for pending payment', async () => {
      await prisma.payment.create({
        data: {
          id: 'pending-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'pending',
          checkout_url: 'https://example.com/checkout',
        },
      });

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'pending-payment',
          amount: 50,
        })
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Payment cannot be refunded'),
      });
    });

    it('should reject refund for expired payment', async () => {
      await prisma.payment.create({
        data: {
          id: 'expired-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() - 86400000), // 24 hours ago
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'expired-payment',
          amount: 50,
        })
      ).rejects.toMatchObject({
        status: 400,
        message: 'Payment has expired and cannot be refunded',
      });
    });

    it('should reject refund for failed payment', async () => {
      await prisma.payment.create({
        data: {
          id: 'failed-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'failed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'failed-payment',
          amount: 50,
        })
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Payment cannot be refunded'),
      });
    });
  });

  describe('Refund Amount Validation', () => {
    beforeEach(async () => {
      await prisma.merchant.create({
        data: {
          id: 'test-merchant',
          business_name: 'Test Merchant',
          email: 'test@example.com',
          phone_number: '+1234567890',
          country: 'US',
          settlement_currency: 'USD',
          webhook_secret: 'secret',
          password: 'hashed_password',
        },
      });
    });

    it('should reject refund amount exceeding payment amount', async () => {
      await prisma.payment.create({
        data: {
          id: 'test-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: 150,
        })
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('cannot exceed original payment amount'),
      });
    });

    it('should reject refund with zero amount', async () => {
      await prisma.payment.create({
        data: {
          id: 'test-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: 0,
        })
      ).rejects.toMatchObject({
        status: 400,
        message: 'Refund amount must be positive',
      });
    });

    it('should reject refund with negative amount', async () => {
      await prisma.payment.create({
        data: {
          id: 'test-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: 'test-payment',
          amount: -50,
        })
      ).rejects.toMatchObject({
        status: 400,
        message: 'Refund amount must be positive',
      });
    });

    it('should prevent double refunding beyond payment amount', async () => {
      const payment = await prisma.payment.create({
        data: {
          id: 'test-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      // Create first refund (completed)
      await prisma.refund.create({
        data: {
          merchantId: 'test-merchant',
          paymentId: payment.id,
          amount: 60,
          currency: 'USD',
          status: 'completed',
        },
      });

      // Try to refund more than remaining
      await expect(
        createRefundService({
          merchantId: 'test-merchant',
          payment_id: payment.id,
          amount: 50, // Only 40 remaining
        })
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('exceeds remaining refundable amount'),
      });
    });

    it('should allow partial refund within limits', async () => {
      const payment = await prisma.payment.create({
        data: {
          id: 'test-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });

      // Create first refund (completed)
      await prisma.refund.create({
        data: {
          merchantId: 'test-merchant',
          paymentId: payment.id,
          amount: 40,
          currency: 'USD',
          status: 'completed',
        },
      });

      // Should allow refund of remaining amount
      const result = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: payment.id,
        amount: 60,
      });

      expect(result.message).toBe('Refund created successfully');
    });
  });

  describe('Idempotency', () => {
    beforeEach(async () => {
      await prisma.merchant.create({
        data: {
          id: 'test-merchant',
          business_name: 'Test Merchant',
          email: 'test@example.com',
          phone_number: '+1234567890',
          country: 'US',
          settlement_currency: 'USD',
          webhook_secret: 'secret',
          password: 'hashed_password',
        },
      });

      await prisma.payment.create({
        data: {
          id: 'test-payment',
          merchantId: 'test-merchant',
          amount: 100,
          currency: 'USD',
          customer_email: 'customer@example.com',
          metadata: {},
          expiration: new Date(Date.now() + 86400000),
          status: 'confirmed',
          checkout_url: 'https://example.com/checkout',
        },
      });
    });

    it('should return existing refund for duplicate request', async () => {
      // Create initial refund
      const firstRefund = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment',
        amount: 50,
        reason: 'Customer request',
        idempotency_key: 'unique-key-123',
      });

      // Try to create duplicate refund with same idempotency key
      const secondRefund = await createRefundService({
        merchantId: 'test-merchant',
        payment_id: 'test-payment',
        amount: 50,
        reason: 'Customer request',
        idempotency_key: 'unique-key-123',
      });

      // Should return the same refund
      expect(secondRefund.data.id).toBe(firstRefund.data.id);
    });
  });
});
