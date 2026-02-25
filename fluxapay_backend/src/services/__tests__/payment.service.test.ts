import { PaymentService } from '../payment.service';
import { PrismaClient } from '@prisma/client';
import { HDWalletService } from '../HDWalletService';
import { StellarService } from '../StellarService';

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    payment: {
      count: jest.fn(),
      create: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Mock HDWalletService
jest.mock('../HDWalletService');

// Mock StellarService
jest.mock('../StellarService');

describe('PaymentService', () => {
  let mockPrisma: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HD_WALLET_MASTER_SEED: 'test-master-seed-123',
    };
    mockPrisma = new PrismaClient();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('checkRateLimit', () => {
    afterEach(() => {
      delete process.env.PAYMENT_RATE_LIMIT_PER_MINUTE;
    });

    it('should return true if under rate limit', async () => {
      mockPrisma.payment.count.mockResolvedValue(3);
      const result = await PaymentService.checkRateLimit('merchant_1');
      expect(result).toBe(true);
    });

    it('should return false if at or over rate limit', async () => {
      mockPrisma.payment.count.mockResolvedValue(5);
      const result = await PaymentService.checkRateLimit('merchant_1');
      expect(result).toBe(false);
    });

    it('should use PAYMENT_RATE_LIMIT_PER_MINUTE when set', async () => {
      process.env.PAYMENT_RATE_LIMIT_PER_MINUTE = '10';

      mockPrisma.payment.count.mockResolvedValue(9);
      const underLimit = await PaymentService.checkRateLimit('merchant_1');
      expect(underLimit).toBe(true);

      mockPrisma.payment.count.mockResolvedValue(10);
      const atLimit = await PaymentService.checkRateLimit('merchant_1');
      expect(atLimit).toBe(false);
    });
  });

  describe('getRateLimitWindowSeconds', () => {
    afterEach(() => {
      delete process.env.PAYMENT_RATE_LIMIT_WINDOW_SECONDS;
    });

    it('should default to 60 seconds when not configured', () => {
      expect(PaymentService.getRateLimitWindowSeconds()).toBe(60);
    });

    it('should use PAYMENT_RATE_LIMIT_WINDOW_SECONDS when set', () => {
      process.env.PAYMENT_RATE_LIMIT_WINDOW_SECONDS = '120';
      expect(PaymentService.getRateLimitWindowSeconds()).toBe(120);
    });
  });

  describe('createPayment', () => {
    it('should create payment with derived Stellar address', async () => {
      const mockStellarAddress = 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABC';
      const mockPaymentData = {
        id: 'payment_123',
        amount: 100,
        currency: 'USDC',
        customer_email: 'test@example.com',
        merchantId: 'merchant_1',
        metadata: {},
        expiration: expect.any(Date),
        status: 'pending',
        checkout_url: expect.any(String),
        stellar_address: mockStellarAddress,
      };

      // Mock HDWalletService with async methods
      (HDWalletService as jest.MockedClass<typeof HDWalletService>).mockImplementation(() => ({
        derivePaymentAddress: jest.fn().mockResolvedValue(mockStellarAddress),
        regenerateKeypair: jest.fn(),
        verifyAddress: jest.fn(),
      } as any));

      // Mock StellarService
      const mockPrepareAccount = jest.fn().mockResolvedValue(undefined);
      (StellarService as jest.MockedClass<typeof StellarService>).mockImplementation(() => ({
        prepareAccount: mockPrepareAccount,
      } as any));

      mockPrisma.payment.create.mockResolvedValue(mockPaymentData);

      const result = await PaymentService.createPayment({
        amount: 100,
        currency: 'USDC',
        customer_email: 'test@example.com',
        merchantId: 'merchant_1',
        metadata: {},
      });

      expect(result.stellar_address).toBe(mockStellarAddress);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stellar_address: mockStellarAddress,
          amount: 100,
          currency: 'USDC',
          customer_email: 'test@example.com',
          merchantId: 'merchant_1',
        }),
      });
    });

    it('should work without HD_WALLET_MASTER_SEED when using KMS', async () => {
      // Remove the legacy env var to test KMS mode
      delete process.env.HD_WALLET_MASTER_SEED;
      
      const mockStellarAddress = 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABC';

      // Mock HDWalletService with async methods
      (HDWalletService as jest.MockedClass<typeof HDWalletService>).mockImplementation(() => ({
        derivePaymentAddress: jest.fn().mockResolvedValue(mockStellarAddress),
        regenerateKeypair: jest.fn(),
        verifyAddress: jest.fn(),
      } as any));

      (StellarService as jest.MockedClass<typeof StellarService>).mockImplementation(() => ({
        prepareAccount: jest.fn().mockResolvedValue(undefined),
      } as any));

      mockPrisma.payment.create.mockResolvedValue({
        id: 'payment_123',
        stellar_address: mockStellarAddress,
      });

      const result = await PaymentService.createPayment({
        amount: 100,
        currency: 'USDC',
        customer_email: 'test@example.com',
        merchantId: 'merchant_1',
        metadata: {},
      });

      expect(result.stellar_address).toBe(mockStellarAddress);
    });

    it('should call prepareAccount asynchronously', async () => {
      const mockStellarAddress = 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABC';
      const mockPrepareAccount = jest.fn().mockResolvedValue(undefined);

      (HDWalletService as jest.MockedClass<typeof HDWalletService>).mockImplementation(() => ({
        derivePaymentAddress: jest.fn().mockResolvedValue(mockStellarAddress),
        regenerateKeypair: jest.fn(),
        verifyAddress: jest.fn(),
      } as any));

      (StellarService as jest.MockedClass<typeof StellarService>).mockImplementation(() => ({
        prepareAccount: mockPrepareAccount,
      } as any));

      mockPrisma.payment.create.mockResolvedValue({
        id: 'payment_123',
        stellar_address: mockStellarAddress,
      });

      await PaymentService.createPayment({
        amount: 100,
        currency: 'USDC',
        customer_email: 'test@example.com',
        merchantId: 'merchant_1',
        metadata: {},
      });

      // prepareAccount is called asynchronously, so we need to wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPrepareAccount).toHaveBeenCalledWith('merchant_1', expect.any(String));
    });
  });
});
