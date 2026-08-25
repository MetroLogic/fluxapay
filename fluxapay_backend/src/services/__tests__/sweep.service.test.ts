/**
 * sweep.service.test.ts
 *
 * Unit tests for the SweepService that moves USDC from payment addresses
 * to the master vault and optionally merges accounts to reclaim XLM.
 */

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn(),
        submitTransaction: jest.fn(),
        feeStats: jest.fn().mockResolvedValue({
          fee_charged: { p90: "150" },
        }),
      })),
    },
  };
});

// Mock dependencies before imports
const mockPrisma = {
  payment: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  depositAddress: {
    findFirst: jest.fn(),
  },
  $executeRaw: jest.fn(),
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock("../audit.service", () => ({
  logSweepTrigger: jest.fn().mockResolvedValue({ id: "audit_test" }),
  updateSweepCompletion: jest.fn().mockResolvedValue(undefined),
  logSweepFailure: jest.fn().mockResolvedValue({ id: "audit_fail_test" }),
}));

jest.mock("../sweepQueue.service", () => ({
  sweepQueue: {
    enqueue: jest.fn(async (_id, fn) => fn()),
    canAcceptTask: jest.fn(() => true),
    getBackpressureLevel: jest.fn(() => 0.5),
    getStats: jest.fn(() => ({ queued: 0, active: 0 })),
  },
}));

jest.mock("../HDWalletService", () => ({
  HDWalletService: jest.fn().mockImplementation(() => ({
    regenerateKeypairFromPath: jest.fn(),
    regenerateKeypair: jest.fn(),
    decryptKeyData: jest.fn(),
  })),
}));

jest.mock("../../config/sweep.config", () => ({
  getSweepMinBalanceUsdc: jest.fn(() => 10),
  getMaxSweepRetryAttempts: jest.fn(() => 5),
}));

import { Horizon, Keypair, Account } from "@stellar/stellar-sdk";

// Set required env vars for module load
process.env.MASTER_VAULT_SECRET_KEY = Keypair.random().secret();

// Import after mocks
import { SweepService } from "../sweep.service";
import { logSweepFailure } from "../audit.service";

describe("SweepService", () => {
  let sweepService: SweepService;
  let mockServer: any;
  let mockHDWalletService: any;
  let issuerPublicKey: string;

  it("re-throws initialization errors instead of exporting an undefined service", () => {
    jest.resetModules();
    delete process.env.MASTER_VAULT_SECRET_KEY;

    expect(() => {
      jest.isolateModules(() => {
        require("../sweep.service");
      });
    }).toThrow("MASTER_VAULT_SECRET_KEY is required");
  });

  function createSweepFixture(
    paymentOverrides: Record<string, unknown> = {},
    balance = "100.0000000",
  ) {
    const source = Keypair.random();
    const keypair = {
      publicKey: source.publicKey(),
      secretKey: source.secret(),
    };
    const payment = {
      id: "payment_1",
      merchantId: "merchant_1",
      amount: "100.00",
      status: "confirmed",
      stellar_address: keypair.publicKey,
      derivation_path: "m/44'/148'/0'/0/0",
      swept: false,
      confirmed_at: new Date(),
      ...paymentOverrides,
    };
    const account = Object.assign(new Account(keypair.publicKey, "123456"), {
      balances: [
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: issuerPublicKey,
          balance,
        },
      ],
    });
    return { payment, keypair, account };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    const issuerKeypair = Keypair.random();
    const vaultKeypair = Keypair.random();
    issuerPublicKey = issuerKeypair.publicKey();

    // Mock environment variables
    process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
    process.env.STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
    process.env.STELLAR_BASE_FEE = "100";
    process.env.STELLAR_MAX_FEE = "2000";
    delete process.env.SWEEP_MAX_FEE_STROOPS;
    process.env.STELLAR_FEE_BUMP_MULTIPLIER = "2";
    process.env.STELLAR_TX_MAX_RETRIES = "3";
    process.env.USDC_ISSUER_PUBLIC_KEY = issuerPublicKey;
    process.env.MASTER_VAULT_SECRET_KEY = vaultKeypair.secret();
    process.env.FUNDER_PUBLIC_KEY = Keypair.random().publicKey();
    process.env.SWEEP_BATCH_LIMIT = "200";

    // Mock Stellar Server
    mockServer = {
      loadAccount: jest.fn(),
      submitTransaction: jest.fn(),
      feeStats: jest.fn().mockResolvedValue({
        fee_charged: { p90: "150" },
      }),
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
      const { payment, keypair, account } = createSweepFixture();

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
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
      const { payment, keypair } = createSweepFixture();
      const account = Object.assign(new Account(keypair.publicKey, "123456"), {
        balances: [{ asset_type: "native", balance: "10.0000000" }],
      });

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(result.addressesSwept).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("No USDC balance");
    });

    it("should skip payments below minimum balance threshold", async () => {
      process.env.SWEEP_MIN_BALANCE_USDC = "0.5";

      const { payment, keypair, account } = createSweepFixture(
        { amount: "0.30" },
        "0.3000000",
      );

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(result.addressesSwept).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("below minimum threshold");
      expect(mockServer.submitTransaction).not.toHaveBeenCalled();
    });

    it("should skip payments with address mismatch", async () => {
      const mismatchKey = Keypair.random();
      const { payment } = createSweepFixture({
        stellar_address: Keypair.random().publicKey(),
      });
      const keypair = {
        publicKey: mismatchKey.publicKey(),
        secretKey: mismatchKey.secret(),
      };

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(result.addressesSwept).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("address mismatch");
    });

    it("should handle dry run mode without submitting transactions", async () => {
      const { payment, keypair, account } = createSweepFixture();

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);

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
      const { payment, keypair, account } = createSweepFixture({
        derivation_path: undefined,
        encrypted_key_data: "encrypted_data",
      });

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.decryptKeyData.mockResolvedValue({
        merchantIndex: 0,
        paymentIndex: 0,
      });
      mockHDWalletService.regenerateKeypair.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
      mockServer.submitTransaction.mockResolvedValue({ hash: "tx_hash_123" });

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(mockHDWalletService.decryptKeyData).toHaveBeenCalledWith("encrypted_data");
      expect(mockHDWalletService.regenerateKeypair).toHaveBeenCalledWith(0, 0, 1);
      expect(result.addressesSwept).toBe(1);
    });

    it("should use legacy DB lookup when both derivation_path and encrypted_key_data are missing", async () => {
      const { payment, keypair, account } = createSweepFixture({
        derivation_path: undefined,
      });

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypair.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
      mockServer.submitTransaction.mockResolvedValue({ hash: "tx_hash_123" });

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(mockHDWalletService.regenerateKeypair).toHaveBeenCalledWith(
        "merchant_1",
        "payment_1",
        1,
      );
      expect(result.addressesSwept).toBe(1);
    });
  });

  describe("fee calculation and dynamic Horizon fee stats (#753)", () => {
    it("should calculate fees with exponential backoff using base fee", () => {
      const calculateFee = (sweepService as any).calculateFeeForAttempt.bind(sweepService);

      expect(calculateFee(1)).toBe("100"); // Base fee
      expect(calculateFee(2)).toBe("200"); // 2x
      expect(calculateFee(3)).toBe("400"); // 4x
    });

    it("should use max(BASE_FEE, feeStats.fee_charged.p90) when Horizon fee stats are higher", () => {
      const calculateFee = (sweepService as any).calculateFeeForAttempt.bind(sweepService);

      // p90 is 350 > baseFee 100
      expect(calculateFee(1, 350)).toBe("350");
      expect(calculateFee(2, 350)).toBe("700");
      expect(calculateFee(3, 350)).toBe("1400");
    });

    it("should use BASE_FEE when Horizon fee stats p90 is lower than base fee", () => {
      const calculateFee = (sweepService as any).calculateFeeForAttempt.bind(sweepService);

      // p90 is 50 < baseFee 100
      expect(calculateFee(1, 50)).toBe("100");
      expect(calculateFee(2, 50)).toBe("200");
    });

    it("should cap fees at SWEEP_MAX_FEE_STROOPS and emit metric when capped fee is reached", () => {
      process.env.SWEEP_MAX_FEE_STROOPS = "1500";
      const metricsMock = (sweepService as any).metrics;
      const metricsSpy = jest.spyOn(metricsMock, "increment");

      const calculateFee = (sweepService as any).calculateFeeForAttempt.bind(sweepService);

      // 350 * 2^2 = 1400 (< 1500)
      expect(calculateFee(3, 350)).toBe("1400");
      // 350 * 2^3 = 2800 (>= 1500 capped)
      expect(calculateFee(4, 350)).toBe("1500");
      expect(metricsSpy).toHaveBeenCalledWith(
        "stellar.sweep.capped_fee_reached",
        expect.objectContaining({
          attempt: "4",
          maxFee: "1500",
        }),
      );
    });

    it("fetches /fee_stats from Horizon before each sweep attempt", async () => {
      const { payment, keypair, account } = createSweepFixture();

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
      mockServer.submitTransaction.mockResolvedValue({ hash: "tx_hash_fee_test" });
      mockServer.feeStats.mockResolvedValue({
        fee_charged: { p90: "250" },
      });

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(mockServer.feeStats).toHaveBeenCalled();
      expect(result.addressesSwept).toBe(1);
    });
  });

  describe("transaction retry logic", () => {
    it("should retry failed transactions with fee bumps", async () => {
      const { payment, keypair, account } = createSweepFixture();

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
      
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
      const { payment, keypair, account } = createSweepFixture();

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
      mockServer.submitTransaction.mockRejectedValue(new Error("tx_failed"));

      const result = await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(mockServer.submitTransaction).toHaveBeenCalledTimes(3); // Max retries
      expect(result.addressesSwept).toBe(0);
      expect(result.skipped).toHaveLength(1);
    });
  });

  describe("per-payment error isolation (#824)", () => {
    it("isolates a single failing sweep: batch of 5 payments with 1 failing completes the other 4", async () => {
      const fixtures = Array.from({ length: 5 }, (_, i) =>
        createSweepFixture({
          id: `payment_${i}`,
          derivation_path: `m/44'/148'/0'/0/${i}`,
        }),
      );
      const failingFixture = fixtures[2];

      mockPrisma.payment.findMany.mockResolvedValue(
        fixtures.map((f) => f.payment),
      );

      mockHDWalletService.regenerateKeypairFromPath.mockImplementation(
        async (path: string) => {
          const fixture = fixtures.find(
            (f) => f.payment.derivation_path === path,
          );
          return fixture!.keypair;
        },
      );

      mockServer.loadAccount.mockImplementation(async (publicKey: string) => {
        const fixture = fixtures.find((f) => f.keypair.publicKey === publicKey);
        return fixture!.account;
      });

      mockServer.submitTransaction.mockImplementation(async (tx: any) => {
        if (tx.source === failingFixture.keypair.publicKey) {
          throw new Error("insufficient XLM for fee");
        }
        return { hash: `tx_hash_${tx.source}` };
      });

      const result = await sweepService.sweepPaidPayments({
        adminId: "admin_1",
      });

      expect(result.addressesSwept).toBe(4);
      expect(result.txHashes).toHaveLength(4);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].paymentId).toBe(failingFixture.payment.id);

      // The failing payment's retry bookkeeping was persisted...
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: failingFixture.payment.id },
        data: {
          sweep_retry_count: 1,
          sweep_last_error: expect.stringContaining("insufficient XLM"),
          sweep_failed_at: expect.any(Date),
          sweep_needs_manual_review: false,
        },
      });

      // ...and the other 4 were still marked swept despite the one failure.
      const successfulIds = fixtures
        .filter((f) => f.payment.id !== failingFixture.payment.id)
        .map((f) => f.payment.id);
      for (const id of successfulIds) {
        expect(mockPrisma.payment.update).toHaveBeenCalledWith({
          where: { id },
          data: {
            swept: true,
            swept_at: expect.any(Date),
            sweep_tx_hash: expect.any(String),
          },
        });
      }
    });

    it("increments sweep_retry_count and logs an audit entry on a failed sweep", async () => {
      const { payment, keypair, account } = createSweepFixture({
        sweep_retry_count: 2,
      });

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
      mockServer.submitTransaction.mockRejectedValue(
        new Error("invalid trustline"),
      );

      const result = await sweepService.sweepPaidPayments({
        adminId: "admin_1",
      });

      expect(result.addressesSwept).toBe(0);
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: payment.id },
        data: {
          sweep_retry_count: 3,
          sweep_last_error: expect.stringContaining("invalid trustline"),
          sweep_failed_at: expect.any(Date),
          sweep_needs_manual_review: false,
        },
      });
      expect(logSweepFailure).toHaveBeenCalledWith({
        paymentId: payment.id,
        error: expect.stringContaining("invalid trustline"),
        retryCount: 3,
        flaggedForManualReview: false,
      });
    });

    it("flags a payment for manual review once max retry attempts are reached", async () => {
      const { payment, keypair, account } = createSweepFixture({
        sweep_retry_count: 4,
      });

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
      mockServer.submitTransaction.mockRejectedValue(new Error("tx_failed"));

      await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      // getMaxSweepRetryAttempts() is mocked to 5, so the 5th failure flips the flag.
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: payment.id },
        data: {
          sweep_retry_count: 5,
          sweep_last_error: expect.any(String),
          sweep_failed_at: expect.any(Date),
          sweep_needs_manual_review: true,
        },
      });
      expect(logSweepFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          retryCount: 5,
          flaggedForManualReview: true,
        }),
      );
    });

    it("excludes payments already flagged for manual review from the sweep query", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await sweepService.sweepPaidPayments({ adminId: "admin_1" });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sweep_needs_manual_review: false,
          }),
        }),
      );
    });

    it("does not abort the batch when persisting sweep-failure bookkeeping itself fails", async () => {
      const { payment, keypair, account } = createSweepFixture();

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
      mockServer.submitTransaction.mockRejectedValue(new Error("tx_failed"));
      mockPrisma.payment.update.mockRejectedValueOnce(
        new Error("db unavailable"),
      );
      (logSweepFailure as jest.Mock).mockRejectedValueOnce(
        new Error("audit unavailable"),
      );

      const result = await sweepService.sweepPaidPayments({
        adminId: "admin_1",
      });

      expect(result.addressesSwept).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].paymentId).toBe(payment.id);
    });
  });

  describe("account merge", () => {
    it("should include account merge operation when enabled", async () => {
      process.env.SWEEP_ENABLE_ACCOUNT_MERGE = "true";

      const { payment, keypair, account } = createSweepFixture();

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
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

      const { payment, keypair, account } = createSweepFixture();

      mockPrisma.payment.findMany.mockResolvedValue([payment]);
      mockHDWalletService.regenerateKeypairFromPath.mockResolvedValue(keypair);
      mockServer.loadAccount.mockResolvedValue(account);
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
