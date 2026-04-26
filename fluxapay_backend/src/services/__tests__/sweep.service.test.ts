/**
 * sweep.service.test.ts
 *
 * Unit tests for the SweepService that moves USDC from payment addresses
 * to the master vault and optionally merges accounts to reclaim XLM.
 */

import { Horizon } from "@stellar/stellar-sdk";

// Mock dependencies before imports
const mockPrisma = {
  payment: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  $executeRaw: jest.fn(),
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock("../audit.service", () => ({
  logSweepTrigger: jest.fn(),
  updateSweepCompletion: jest.fn(),
}));

jest.mock("../sweepQueue.service", () => ({
  sweepQueue: {
    enqueue: jest.fn((id, fn) => fn()),
  },
}));

jest.mock("../HDWalletService", () => ({
  HDWalletService: jest.fn().mockImplementation(() => ({
    regenerateKeypairFromPath: jest.fn(),
    regenerateKeypair: jest.fn(),
    decryptKeyData: jest.fn(),
  })),
}));

// Import after mocks
import { SweepService } from "../sweep.service";

describe("SweepService", () => {
  let sweepService: SweepService;
  let mockServer: any;
  let mockHDWalletService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock environment variables
    process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
    process.env.STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
    process.env.STELLAR_BASE_FEE = "100";
    process.env.STELLAR_MAX_FEE = "2000";
    process.env.STELLAR_FEE_BUMP_MULTIPLIER = "2";
    process.env.STELLAR_TX_MAX_RETRIES = "3";
    process.env.USDC_ISSUER_PUBLIC_KEY = "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
    process.env.MASTER_VAULT_SECRET_KEY = "SBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
    process.env.FUNDER_PUBLIC_KEY = "GBFUNDER123456789";
    process.env.SWEEP_BATCH_LIMIT = "200";

    // Mock Stellar Server
    mockServer = {
      loadAccount: jest.fn(),
      submitTransaction: jest.fn(),
    };
    (Horizon.Server as jest.Mock).mockImplementation(() => mockServer);

    // Mock HD Wallet Service
    mockHDWalletService = {
      regenerateKeypairFromPath: jest.fn(),
      regenerateKeypair: jest.fn(),
      decryptKeyData: jest.fn(),
    };

    sweepService = new SweepService();
    (sweepService as any).hdWalletService = mockHDWalletService;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("sweepPaidPayments", () => {
    it("should identify and sweep confirmed payments", async () => {
      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          derivation_path: "m/44'/148'/0'/0/0",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GTEST123",
        secretKey: "STEST123",
      };

      const mockAccount = {
        balances: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y",
            balance: "100.0000000",
          },
        ],
        sequence: "123456",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(mockKeypair);
      mockServer.loadAccount.mockResolvedValue(mockAccount);
      mockServer.submitTransaction.mockResolvedValue({ hash: "tx_hash_123" });

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(result.addressesSwept).toBe(1);
      expect(result.totalAmount).toBe("100.0000000");
      expect(result.txHashes).toContain("tx_hash_123");
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: "payment_1" },
        data: {
          swept: true,
          swept_at: expect.any(Date),
          sweep_tx_hash: "tx_hash_123",
        },
      });
    });

    it("should skip payments with no USDC balance", async () => {
      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          derivation_path: "m/44'/148'/0'/0/0",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GTEST123",
        secretKey: "STEST123",
      };

      const mockAccount = {
        balances: [
          {
            asset_type: "native",
            balance: "10.0000000",
          },
        ],
        sequence: "123456",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(mockKeypair);
      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(result.addressesSwept).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("No USDC balance");
    });

    it("should skip payments with address mismatch", async () => {
      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          derivation_path: "m/44'/148'/0'/0/0",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GWRONG456",
        secretKey: "STEST123",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(mockKeypair);

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(result.addressesSwept).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("address mismatch");
    });

    it("should handle dry run mode without submitting transactions", async () => {
      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          derivation_path: "m/44'/148'/0'/0/0",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GTEST123",
        secretKey: "STEST123",
      };

      const mockAccount = {
        balances: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y",
            balance: "100.0000000",
          },
        ],
        sequence: "123456",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(mockKeypair);
      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const result = await sweepService.sweepPaidPayments({
        adminId: "admin_1",
        dryRun: true,
      });

      expect(result.addressesSwept).toBe(1);
      expect(result.decisions).toBeDefined();
      expect(result.decisions![0].action).toBe("sweep");
      expect(mockServer.submitTransaction).not.toHaveBeenCalled();
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    });

    it("should respect batch limit", async () => {
      const mockPayments = Array.from({ length: 50 }, (_, i) => ({
        id: `payment_${i}`,
        merchantId: "merchant_1",
        amount: "100.00",
        status: "confirmed",
        stellar_address: `GTEST${i}`,
        derivation_path: `m/44'/148'/0'/0/${i}`,
        swept: false,
        confirmed_at: new Date(),
      }));

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);

      await sweepService.sweepPaidPayments({ adminId: "admin_1", limit: 10 });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it("should use encrypted_key_data when derivation_path is not available", async () => {
      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          encrypted_key_data: "encrypted_data",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GTEST123",
        secretKey: "STEST123",
      };

      const mockAccount = {
        balances: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y",
            balance: "100.0000000",
          },
        ],
        sequence: "123456",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.decryptKeyData.mockResolvedValue({
        merchantIndex: 0,
        paymentIndex: 0,
      });
      mockHDWalletService.regenerateKeypair.mockResolvedValue(mockKeypair);
      mockServer.loadAccount.mockResolvedValue(mockAccount);
      mockServer.submitTransaction.mockResolvedValue({ hash: "tx_hash_123" });

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(mockHDWalletService.decryptKeyData).toHaveBeenCalledWith("encrypted_data");
      expect(mockHDWalletService.regenerateKeypair).toHaveBeenCalledWith(0, 0);
      expect(result.addressesSwept).toBe(1);
    });

    it("should use legacy DB lookup when both derivation_path and encrypted_key_data are missing", async () => {
      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GTEST123",
        secretKey: "STEST123",
      };

      const mockAccount = {
        balances: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y",
            balance: "100.0000000",
          },
        ],
        sequence: "123456",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.regenerateKeypair.mockResolvedValue(mockKeypair);
      mockServer.loadAccount.mockResolvedValue(mockAccount);
      mockServer.submitTransaction.mockResolvedValue({ hash: "tx_hash_123" });

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(mockHDWalletService.regenerateKeypair).toHaveBeenCalledWith(
        "merchant_1",
        "payment_1"
      );
      expect(result.addressesSwept).toBe(1);
    });
  });

  describe("fee calculation", () => {
    it("should calculate fees with exponential backoff", () => {
      const calculateFee = (sweepService as any).calculateFeeForAttempt.bind(sweepService);

      expect(calculateFee(1)).toBe("100"); // Base fee
      expect(calculateFee(2)).toBe("200"); // 2x
      expect(calculateFee(3)).toBe("400"); // 4x
    });

    it("should cap fees at max fee", () => {
      const calculateFee = (sweepService as any).calculateFeeForAttempt.bind(sweepService);

      expect(calculateFee(10)).toBe("2000"); // Capped at max
    });
  });

  describe("transaction retry logic", () => {
    it("should retry failed transactions with fee bumps", async () => {
      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          derivation_path: "m/44'/148'/0'/0/0",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GTEST123",
        secretKey: "STEST123",
      };

      const mockAccount = {
        balances: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y",
            balance: "100.0000000",
          },
        ],
        sequence: "123456",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(mockKeypair);
      mockServer.loadAccount.mockResolvedValue(mockAccount);
      
      // Fail twice, succeed on third attempt
      mockServer.submitTransaction
        .mockRejectedValueOnce(new Error("tx_bad_seq"))
        .mockRejectedValueOnce(new Error("tx_insufficient_fee"))
        .mockResolvedValueOnce({ hash: "tx_hash_123" });

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(mockServer.submitTransaction).toHaveBeenCalledTimes(3);
      expect(result.addressesSwept).toBe(1);
    });

    it("should fail after max retries", async () => {
      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          derivation_path: "m/44'/148'/0'/0/0",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GTEST123",
        secretKey: "STEST123",
      };

      const mockAccount = {
        balances: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y",
            balance: "100.0000000",
          },
        ],
        sequence: "123456",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(mockKeypair);
      mockServer.loadAccount.mockResolvedValue(mockAccount);
      mockServer.submitTransaction.mockRejectedValue(new Error("tx_failed"));

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(mockServer.submitTransaction).toHaveBeenCalledTimes(3); // Max retries
      expect(result.addressesSwept).toBe(0);
      expect(result.skipped).toHaveLength(1);
    });
  });

  describe("account merge", () => {
    it("should include account merge operation when enabled", async () => {
      process.env.SWEEP_ENABLE_ACCOUNT_MERGE = "true";

      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          derivation_path: "m/44'/148'/0'/0/0",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GTEST123",
        secretKey: "STEST123",
      };

      const mockAccount = {
        balances: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y",
            balance: "100.0000000",
          },
        ],
        sequence: "123456",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(mockKeypair);
      mockServer.loadAccount.mockResolvedValue(mockAccount);
      mockServer.submitTransaction.mockResolvedValue({ hash: "tx_hash_123" });

      const result = await sweepService.sweepPaidPayments({
        adminId: "admin_1",
        enableAccountMerge: true,
      });

      expect(result.addressesSwept).toBe(1);
      // Transaction should include both payment and account merge operations
    });

    it("should skip account merge when FUNDER_PUBLIC_KEY is not set", async () => {
      delete process.env.FUNDER_PUBLIC_KEY;

      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: "100.00",
          status: "confirmed",
          stellar_address: "GTEST123",
          derivation_path: "m/44'/148'/0'/0/0",
          swept: false,
          confirmed_at: new Date(),
        },
      ];

      const mockKeypair = {
        publicKey: "GTEST123",
        secretKey: "STEST123",
      };

      const mockAccount = {
        balances: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y",
            balance: "100.0000000",
          },
        ],
        sequence: "123456",
      };

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(mockKeypair);
      mockServer.loadAccount.mockResolvedValue(mockAccount);
      mockServer.submitTransaction.mockResolvedValue({ hash: "tx_hash_123" });

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const result = await sweepService.sweepPaidPayments({
        adminId: "admin_1",
        enableAccountMerge: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("FUNDER_PUBLIC_KEY is not set")
      );
      expect(result.addressesSwept).toBe(1);

      consoleSpy.mockRestore();
    });
  });
});
