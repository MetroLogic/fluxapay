import { PaymentService } from "../payment.service";
import { PrismaClient } from "../../generated/client/client";
import { HDWalletService } from "../HDWalletService";
import { StellarService } from "../StellarService";

// Mock Prisma
jest.mock("../../generated/client/client", () => {
  const mockPrismaClient = {
    payment: {
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    merchantSubscription: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Mock HDWalletService
jest.mock("../HDWalletService");

// Mock StellarService
jest.mock("../StellarService");

jest.mock("../depositAddress.service", () => ({
  DepositAddressService: {
    allocateAddress: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("../fx.service", () => ({
  FxService: {
    getUSDCExchangeRate: jest.fn().mockResolvedValue(1),
  },
}));

describe("PaymentService", () => {
  let mockPrisma: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HD_WALLET_MASTER_SEED: "test-master-seed-123",
    };
    mockPrisma = new PrismaClient();
    // createPayment persists then updates with the derived address
    mockPrisma.payment.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "payment_123", ...data }),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("checkRateLimit", () => {
    afterEach(() => {
      delete process.env.PAYMENT_RATE_LIMIT_PER_MINUTE;
    });

    it("should return true if under rate limit", async () => {
      mockPrisma.payment.count.mockResolvedValue(3);
      const result = await PaymentService.checkRateLimit("merchant_1");
      expect(result).toBe(true);
    });

    it("should return false if at or over rate limit", async () => {
      mockPrisma.payment.count.mockResolvedValue(5);
      const result = await PaymentService.checkRateLimit("merchant_1");
      expect(result).toBe(false);
    });

    it("should use PAYMENT_RATE_LIMIT_PER_MINUTE when set", async () => {
      process.env.PAYMENT_RATE_LIMIT_PER_MINUTE = "10";

      mockPrisma.payment.count.mockResolvedValue(9);
      const underLimit = await PaymentService.checkRateLimit("merchant_1");
      expect(underLimit).toBe(true);

      mockPrisma.payment.count.mockResolvedValue(10);
      const atLimit = await PaymentService.checkRateLimit("merchant_1");
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
      const mockDerivedAddress = {
        publicKey: mockStellarAddress,
        merchantIndex: 0,
        paymentIndex: 0,
        derivationPath: "m/44'/148'/0'/0'",
      };
      const mockPaymentData = {
        id: "payment_123",
        amount: 100,
        currency: "USDC",
        customer_email: "test@example.com",
        merchantId: "merchant_1",
        metadata: {},
        expiration: expect.any(Date),
        status: "pending",
        checkout_url: expect.any(String),
        stellar_address: mockStellarAddress,
        payment_index: 0,
        derivation_path: "m/44'/148'/0'/0'",
        encrypted_key_data: "encrypted-blob",
      };

      // Mock HDWalletService
      (
        HDWalletService as jest.MockedClass<typeof HDWalletService>
      ).mockImplementation(
        () =>
          ({
            derivePaymentAddress: jest
              .fn()
              .mockResolvedValue(mockDerivedAddress),
            encryptKeyData: jest.fn().mockResolvedValue("encrypted-blob"),
            regenerateKeypair: jest.fn(),
            regenerateKeypairFromPath: jest.fn(),
            verifyAddress: jest.fn(),
            decryptKeyData: jest.fn(),
          }) as any,
      );

      // Mock StellarService
      const mockPrepareAccount = jest.fn().mockResolvedValue(undefined);
      (
        StellarService as jest.MockedClass<typeof StellarService>
      ).mockImplementation(
        () =>
          ({
            prepareAccount: mockPrepareAccount,
          }) as any,
      );

      mockPrisma.payment.create.mockResolvedValue({
        id: "payment_123",
        stellar_address: null,
      });
      mockPrisma.payment.update.mockResolvedValue(mockPaymentData);

      const result = await PaymentService.createPayment({
        amount: 100,
        currency: "USDC",
        customer_email: "test@example.com",
        merchantId: "merchant_1",
        metadata: {},
      });

      expect(result.stellar_address).toBe(mockStellarAddress);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stellar_address: null,
          amount: 100,
          currency: "USDC",
          customer_email: "test@example.com",
          merchantId: "merchant_1",
        }),
      });
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: expect.any(String) },
        data: expect.objectContaining({
          stellar_address: mockStellarAddress,
          payment_index: 0,
          derivation_path: "m/44'/148'/0'/0'",
          encrypted_key_data: "encrypted-blob",
        }),
      });
    });


    it('should sanitize metadata string fields before persistence', async () => {
      const mockStellarAddress =
        'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABC';
      const mockDerivedAddress = {
        publicKey: mockStellarAddress,
        merchantIndex: 0,
        paymentIndex: 0,
        derivationPath: "m/44'/148'/0'/0'",
      };

      (
        HDWalletService as jest.MockedClass<typeof HDWalletService>
      ).mockImplementation(
        () =>
          ({
            derivePaymentAddress: jest
              .fn()
              .mockResolvedValue(mockDerivedAddress),
            encryptKeyData: jest.fn().mockResolvedValue('encrypted-blob'),
            regenerateKeypair: jest.fn(),
            regenerateKeypairFromPath: jest.fn(),
            verifyAddress: jest.fn(),
            decryptKeyData: jest.fn(),
          }) as any,
      );

      (
        StellarService as jest.MockedClass<typeof StellarService>
      ).mockImplementation(
        () =>
          ({
            prepareAccount: jest.fn().mockResolvedValue(undefined),
          }) as any,
      );

      mockPrisma.payment.create.mockResolvedValue({
        id: 'payment_123',
        stellar_address: mockStellarAddress,
      });

      await PaymentService.createPayment({
        amount: 100,
        currency: 'USDC',
        customer_email: 'test@example.com',
        merchantId: 'merchant_1',
        metadata: {
          notes: '<script>alert(1)</script><b>safe text</b>',
          nested: { description: '<img src=x onerror=alert(1)>hello' },
        },
      });

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: {
            notes: 'safe text',
            nested: { description: 'hello' },
          },
        }),
      });
    });

    it('should reject metadata over configured max size', async () => {
      process.env.PAYMENT_METADATA_MAX_BYTES = '10';

      const mockStellarAddress =
        'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABC';
      const mockDerivedAddress = {
        publicKey: mockStellarAddress,
        merchantIndex: 0,
        paymentIndex: 0,
        derivationPath: "m/44'/148'/0'/0'",
      };

      (
        HDWalletService as jest.MockedClass<typeof HDWalletService>
      ).mockImplementation(
        () =>
          ({
            derivePaymentAddress: jest
              .fn()
              .mockResolvedValue(mockDerivedAddress),
            encryptKeyData: jest.fn().mockResolvedValue('encrypted-blob'),
            regenerateKeypair: jest.fn(),
            regenerateKeypairFromPath: jest.fn(),
            verifyAddress: jest.fn(),
            decryptKeyData: jest.fn(),
          }) as any,
      );

      (
        StellarService as jest.MockedClass<typeof StellarService>
      ).mockImplementation(
        () =>
          ({
            prepareAccount: jest.fn().mockResolvedValue(undefined),
          }) as any,
      );

      await expect(
        PaymentService.createPayment({
          amount: 100,
          currency: 'USDC',
          customer_email: 'test@example.com',
          merchantId: 'merchant_1',
          metadata: { big: 'this payload is too large' },
        }),
      ).rejects.toThrow('Metadata exceeds maximum size of 10 bytes');

      delete process.env.PAYMENT_METADATA_MAX_BYTES;
    });
    it("should work without HD_WALLET_MASTER_SEED when using KMS", async () => {
      delete process.env.HD_WALLET_MASTER_SEED;

      const mockStellarAddress =
        "GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABC";
      const mockDerivedAddress = {
        publicKey: mockStellarAddress,
        merchantIndex: 0,
        paymentIndex: 0,
        derivationPath: "m/44'/148'/0'/0'",
      };

      (
        HDWalletService as jest.MockedClass<typeof HDWalletService>
      ).mockImplementation(
        () =>
          ({
            derivePaymentAddress: jest
              .fn()
              .mockResolvedValue(mockDerivedAddress),
            encryptKeyData: jest.fn().mockResolvedValue("encrypted-blob"),
            regenerateKeypair: jest.fn(),
            regenerateKeypairFromPath: jest.fn(),
            verifyAddress: jest.fn(),
            decryptKeyData: jest.fn(),
          }) as any,
      );

      (
        StellarService as jest.MockedClass<typeof StellarService>
      ).mockImplementation(
        () =>
          ({
            prepareAccount: jest.fn().mockResolvedValue(undefined),
          }) as any,
      );

      mockPrisma.payment.create.mockResolvedValue({
        id: "payment_123",
        stellar_address: mockStellarAddress,
      });

      const result = await PaymentService.createPayment({
        amount: 100,
        currency: "USDC",
        customer_email: "test@example.com",
        merchantId: "merchant_1",
        metadata: {},
      });

      expect(result.stellar_address).toBe(mockStellarAddress);
    });

    it("should call prepareAccount asynchronously", async () => {
      const mockStellarAddress =
        "GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABC";
      const mockPrepareAccount = jest.fn().mockResolvedValue(undefined);
      const mockDerivedAddress = {
        publicKey: mockStellarAddress,
        merchantIndex: 0,
        paymentIndex: 0,
        derivationPath: "m/44'/148'/0'/0'",
      };

      (
        HDWalletService as jest.MockedClass<typeof HDWalletService>
      ).mockImplementation(
        () =>
          ({
            derivePaymentAddress: jest
              .fn()
              .mockResolvedValue(mockDerivedAddress),
            encryptKeyData: jest.fn().mockResolvedValue("encrypted-blob"),
            regenerateKeypair: jest.fn(),
            regenerateKeypairFromPath: jest.fn(),
            verifyAddress: jest.fn(),
            decryptKeyData: jest.fn(),
          }) as any,
      );

      (
        StellarService as jest.MockedClass<typeof StellarService>
      ).mockImplementation(
        () =>
          ({
            prepareAccount: mockPrepareAccount,
          }) as any,
      );

      mockPrisma.payment.create.mockResolvedValue({
        id: "payment_123",
        stellar_address: mockStellarAddress,
      });

      await PaymentService.createPayment({
        amount: 100,
        currency: "USDC",
        customer_email: "test@example.com",
        merchantId: "merchant_1",
        metadata: {},
      });

      // prepareAccount is called asynchronously
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockPrepareAccount).toHaveBeenCalledWith(
        "merchant_1",
        expect.any(String),
      );
    });

    describe("payment expiry fallbacks", () => {
      const setupMocks = () => {
        (
          HDWalletService as jest.MockedClass<typeof HDWalletService>
        ).mockImplementation(
          () =>
            ({
              derivePaymentAddress: jest.fn().mockResolvedValue({
                publicKey: "GTEST",
                merchantIndex: 0,
                paymentIndex: 0,
                derivationPath: "m/44'/148'/0'/0'",
              }),
              encryptKeyData: jest.fn().mockResolvedValue("enc"),
            }) as any,
        );
        (
          StellarService as jest.MockedClass<typeof StellarService>
        ).mockImplementation(
          () => ({ prepareAccount: jest.fn().mockResolvedValue(undefined) }) as any,
        );
        mockPrisma.payment.create.mockImplementation(({ data }: any) =>
          Promise.resolve({ id: data.id, expiration: data.expiration }),
        );
      };

      afterEach(() => {
        delete process.env.PAYMENT_EXPIRY_SECONDS;
      });

      it("uses request expires_in_seconds when provided", async () => {
        setupMocks();
        mockPrisma.merchantSubscription.findFirst.mockResolvedValue(null);
        const before = Date.now();
        await PaymentService.createPayment({
          amount: 10,
          currency: "USDC",
          customer_email: "a@b.com",
          merchantId: "m1",
          expires_in_seconds: 120,
        });
        const expiration = mockPrisma.payment.create.mock.calls[0][0].data.expiration as Date;
        expect(expiration.getTime()).toBeGreaterThanOrEqual(before + 120_000 - 50);
        expect(expiration.getTime()).toBeLessThanOrEqual(Date.now() + 120_000 + 50);
      });

      it("falls back to plan max_payment_expiry_seconds", async () => {
        setupMocks();
        mockPrisma.merchantSubscription.findFirst.mockResolvedValue({
          plan: { max_payment_expiry_seconds: 1800 },
        });
        const before = Date.now();
        await PaymentService.createPayment({
          amount: 10,
          currency: "USDC",
          customer_email: "a@b.com",
          merchantId: "m1",
        });
        const expiration = mockPrisma.payment.create.mock.calls[0][0].data.expiration as Date;
        expect(expiration.getTime()).toBeGreaterThanOrEqual(before + 1_800_000 - 50);
        expect(expiration.getTime()).toBeLessThanOrEqual(Date.now() + 1_800_000 + 50);
      });

      it("falls back to PAYMENT_EXPIRY_SECONDS env var", async () => {
        setupMocks();
        process.env.PAYMENT_EXPIRY_SECONDS = "600";
        mockPrisma.merchantSubscription.findFirst.mockResolvedValue(null);
        const before = Date.now();
        await PaymentService.createPayment({
          amount: 10,
          currency: "USDC",
          customer_email: "a@b.com",
          merchantId: "m1",
        });
        const expiration = mockPrisma.payment.create.mock.calls[0][0].data.expiration as Date;
        expect(expiration.getTime()).toBeGreaterThanOrEqual(before + 600_000 - 50);
        expect(expiration.getTime()).toBeLessThanOrEqual(Date.now() + 600_000 + 50);
      });

      it("falls back to 900s default", async () => {
        setupMocks();
        delete process.env.PAYMENT_EXPIRY_SECONDS;
        mockPrisma.merchantSubscription.findFirst.mockResolvedValue(null);
        expect(PaymentService.resolvePaymentExpirySeconds(undefined, null)).toBe(900);
        const before = Date.now();
        await PaymentService.createPayment({
          amount: 10,
          currency: "USDC",
          customer_email: "a@b.com",
          merchantId: "m1",
        });
        const expiration = mockPrisma.payment.create.mock.calls[0][0].data.expiration as Date;
        expect(expiration.getTime()).toBeGreaterThanOrEqual(before + 900_000 - 50);
        expect(expiration.getTime()).toBeLessThanOrEqual(Date.now() + 900_000 + 50);
      });

      it("returns 400 when expires_in_seconds exceeds plan max", async () => {
        setupMocks();
        mockPrisma.merchantSubscription.findFirst.mockResolvedValue({
          plan: { max_payment_expiry_seconds: 900 },
        });
        await expect(
          PaymentService.createPayment({
            amount: 10,
            currency: "USDC",
            customer_email: "a@b.com",
            merchantId: "m1",
            expires_in_seconds: 1800,
          }),
        ).rejects.toMatchObject({
          status: 400,
          code: "VALIDATION_ERROR",
        });
        expect(mockPrisma.payment.create).not.toHaveBeenCalled();
      });
    });
  });
});
