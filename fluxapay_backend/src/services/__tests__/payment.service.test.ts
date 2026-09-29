import { PaymentService } from "../payment.service";
import { PrismaClient } from "../../generated/client/client";
import { HDWalletService } from "../HDWalletService";
import { StellarService } from "../StellarService";
import { FxService } from "../fx.service";
import { DepositAddressService } from "../depositAddress.service";
import { eventBus, AppEvents } from "../EventService";
import { sorobanQueue } from "../sorobanQueue.service";
import { PaymentStatus } from "../../types/payment";

// Mock Prisma
jest.mock("../../generated/client/client", () => {
  const mockPrismaClient = {
    payment: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
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

jest.mock("../sorobanQueue.service", () => ({
  sorobanQueue: { enqueue: jest.fn() },
}));

jest.mock("../fx.service", () => ({
  FxService: {
    getUSDCExchangeRate: jest.fn().mockResolvedValue(1),
    getUSDCExchangeRateWithMeta: jest
      .fn()
      .mockResolvedValue({ rate: 1, stale: false, circuitState: "closed" }),
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
    jest.restoreAllMocks();
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
    it("uses an allocated deposit address without deriving an HD address", async () => {
      const pooledAddress = "GPOOL123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABC";
      (DepositAddressService.allocateAddress as jest.Mock).mockResolvedValueOnce(
        pooledAddress,
      );
      (
        StellarService as jest.MockedClass<typeof StellarService>
      ).mockImplementation(
        () => ({ prepareAccount: jest.fn().mockResolvedValue(undefined) }) as any,
      );

      await PaymentService.createPayment({
        amount: 25,
        currency: "USD",
        customer_email: "customer@example.com",
        merchantId: "merchant_1",
      });

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stellar_address: null,
          payment_index: null,
          derivation_path: null,
        }),
      });
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: expect.any(String) },
        data: {
          stellar_address: pooledAddress,
          payment_index: null,
          derivation_path: null,
          encrypted_key_data: null,
        },
      });
      expect(HDWalletService).not.toHaveBeenCalled();
    });

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

    it("should persist fx_rate_stale when the FX circuit breaker served a stale rate (#823)", async () => {
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
            derivePaymentAddress: jest.fn().mockResolvedValue(mockDerivedAddress),
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
        () => ({ prepareAccount: jest.fn().mockResolvedValue(undefined) }) as any,
      );

      (FxService.getUSDCExchangeRateWithMeta as jest.Mock).mockResolvedValueOnce({
        rate: 1550,
        stale: true,
        circuitState: "open",
      });

      mockPrisma.payment.create.mockResolvedValue({
        id: "payment_123",
        stellar_address: null,
      });

      await PaymentService.createPayment({
        amount: 100,
        currency: "NGN",
        customer_email: "test@example.com",
        merchantId: "merchant_1",
        metadata: {},
      });

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fx_rate: 1550,
          fx_rate_stale: true,
        }),
      });
    });

    it.each([0, -1, NaN])(
      "should reject with 502 and not persist the payment when the FX rate is %p",
      async (badRate) => {
        (FxService.getUSDCExchangeRateWithMeta as jest.Mock).mockResolvedValueOnce({
          rate: badRate,
          stale: false,
          circuitState: "closed",
        });

        await expect(
          PaymentService.createPayment({
            amount: 100,
            currency: "NGN",
            customer_email: "test@example.com",
            merchantId: "merchant_1",
            metadata: {},
          }),
        ).rejects.toMatchObject({ status: 502, code: "FX_INVALID_RATE" });

        expect(mockPrisma.payment.create).not.toHaveBeenCalled();
      },
    );

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

  describe("verifyPayment", () => {
    it("confirms the payment, queues on-chain verification, and emits update events", async () => {
      const payment = { id: "payment_123", status: PaymentStatus.CONFIRMED };
      mockPrisma.payment.update.mockResolvedValue(payment);
      const emitSpy = jest.spyOn(eventBus, "emit").mockReturnValue(true);

      const result = await PaymentService.verifyPayment(
        "payment_123",
        "tx_hash_123",
        "GTEST123",
        12.5,
      );

      expect(result).toBe(payment);
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: "payment_123" },
        data: {
          status: PaymentStatus.CONFIRMED,
          transaction_hash: "tx_hash_123",
          payer_address: "GTEST123",
          confirmed_at: expect.any(Date),
        },
      });
      expect(sorobanQueue.enqueue).toHaveBeenCalledWith(
        "payment_123",
        "tx_hash_123",
        "12.5",
      );
      expect(emitSpy).toHaveBeenNthCalledWith(
        1,
        AppEvents.PAYMENT_CONFIRMED,
        payment,
      );
      expect(emitSpy).toHaveBeenNthCalledWith(
        2,
        AppEvents.PAYMENT_UPDATED,
        payment,
      );
    });

    it("does not enqueue or emit events when the confirmation update fails", async () => {
      const error = new Error("database unavailable");
      mockPrisma.payment.update.mockRejectedValue(error);
      const emitSpy = jest.spyOn(eventBus, "emit").mockReturnValue(true);

      await expect(
        PaymentService.verifyPayment(
          "payment_123",
          "tx_hash_123",
          "GTEST123",
          12.5,
        ),
      ).rejects.toBe(error);

      expect(sorobanQueue.enqueue).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe("updatePayment", () => {
    it("updates a payment note only after matching the merchant", async () => {
      const existingPayment = { id: "payment_123", merchantId: "merchant_1" };
      const updatedPayment = { ...existingPayment, note: "Order 42" };
      mockPrisma.payment.findFirst.mockResolvedValue(existingPayment);
      mockPrisma.payment.update.mockResolvedValue(updatedPayment);
      const emitSpy = jest.spyOn(eventBus, "emit").mockReturnValue(true);

      const result = await PaymentService.updatePayment(
        "payment_123",
        "merchant_1",
        { note: "Order 42" },
      );

      expect(result).toBe(updatedPayment);
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith({
        where: { id: "payment_123", merchantId: "merchant_1" },
      });
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: "payment_123" },
        data: { note: "Order 42" },
      });
      expect(emitSpy).toHaveBeenCalledWith(AppEvents.PAYMENT_UPDATED, updatedPayment);
    });

    it("rejects when the payment is not owned by the merchant", async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      const emitSpy = jest.spyOn(eventBus, "emit").mockReturnValue(true);

      await expect(
        PaymentService.updatePayment("payment_123", "merchant_1", {
          note: "Order 42",
        }),
      ).rejects.toMatchObject({ status: 404, code: "PAYMENT_NOT_FOUND" });

      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });
});
