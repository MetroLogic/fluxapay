import { HDWalletService } from "../HDWalletService";

// Mock Prisma for all tests in this file
jest.mock("../../generated/client/client", () => {
  let globalCounter = 0;
  const merchantIndices: Record<string, number> = {};
  const merchantCounters: Record<string, number> = {};

  const makeTx = () => ({
    merchantHDIndex: {
      findUnique: jest.fn(({ where }: any) => {
        const idx = merchantIndices[where.merchantId];
        return Promise.resolve(
          idx !== undefined
            ? {
                merchantId: where.merchantId,
                merchant_index: idx,
                payment_counter: merchantCounters[where.merchantId] ?? 0,
              }
            : null,
        );
      }),
      create: jest.fn(({ data }: any) => {
        merchantIndices[data.merchantId] = data.merchant_index;
        merchantCounters[data.merchantId] = 0;
        return Promise.resolve(data);
      }),
    },
    hDIndexCounter: {
      upsert: jest.fn(() => Promise.resolve({})),
      update: jest.fn(() => {
        globalCounter++;
        return Promise.resolve({
          id: "global",
          next_merchant_index: globalCounter,
        });
      }),
    },
  });

  const mockPrisma = {
    $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) =>
      fn(makeTx()),
    ),
    merchantHDIndex: {
      findUnique: jest.fn(({ where }: any) => {
        const idx = merchantIndices[where.merchantId];
        return Promise.resolve(
          idx !== undefined
            ? {
                merchantId: where.merchantId,
                merchant_index: idx,
                payment_counter: merchantCounters[where.merchantId] ?? 0,
              }
            : null,
        );
      }),
      update: jest.fn(({ where, data }: any) => {
        if (data.payment_counter?.increment) {
          merchantCounters[where.merchantId] =
            (merchantCounters[where.merchantId] ?? 0) +
            data.payment_counter.increment;
        }
        return Promise.resolve({
          merchant_index: merchantIndices[where.merchantId],
          payment_counter: merchantCounters[where.merchantId],
        });
      }),
    },
    payment: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve({ id: where.id, payment_index: 0 }),
      ),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe("HDWalletService", () => {
  const masterSeed = "test-master-seed-123-deterministic-value-pad";
  let service: HDWalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HDWalletService(masterSeed);
  });

  describe("constructor", () => {
    it("should throw error if master seed is missing", () => {
      expect(() => new HDWalletService("")).toThrow("Master seed is required");
    });
  });

  describe("derivePaymentAddress", () => {
    it("should return a valid Stellar public key", async () => {
      const result = await service.derivePaymentAddress(
        "merchant_1",
        "payment_A",
      );
      expect(result.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
    });

    it("should include a BIP44 derivation path", async () => {
      const result = await service.derivePaymentAddress(
        "merchant_1",
        "payment_B",
      );
      expect(result.derivationPath).toMatch(/^m\/44'\/148'\/\d+'\/\d+'$/);
    });

    it("should derive different addresses for different payment IDs (different payment_index)", async () => {
      const r1 = await service.derivePaymentAddress("merchant_1", "payment_C");
      const r2 = await service.derivePaymentAddress("merchant_1", "payment_D");
      expect(r1.publicKey).not.toBe(r2.publicKey);
    });

    it("should derive different addresses for different merchant IDs (different merchant_index)", async () => {
      const r1 = await service.derivePaymentAddress("merchant_X", "payment_A");
      const r2 = await service.derivePaymentAddress("merchant_Y", "payment_A");
      expect(r1.publicKey).not.toBe(r2.publicKey);
    });
  });

  describe("regenerateKeypairFromPath", () => {
    it("should regenerate the correct keypair from a derivation path", async () => {
      const derived = await service.derivePaymentAddress(
        "merchant_1",
        "payment_A",
      );
      const { publicKey, secretKey } = await service.regenerateKeypairFromPath(
        derived.derivationPath,
      );

      expect(publicKey).toBe(derived.publicKey);
      expect(secretKey).toMatch(/^S[A-Z0-9]{55}$/);
    });
  });

  describe("regenerateKeypair (numeric indices)", () => {
    it("should accept numeric merchantIndex and paymentIndex directly", async () => {
      const { publicKey, secretKey } = await service.regenerateKeypair(0, 0);
      expect(publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(secretKey).toMatch(/^S[A-Z0-9]{55}$/);
    });
  });

  describe("verifyAddress", () => {
    it("should return true for correctly derived address", async () => {
      const { publicKey } = await service.regenerateKeypair(0, 0);
      expect(await service.verifyAddress(0, 0, publicKey)).toBe(true);
    });

    it("should return false for incorrect address", async () => {
      const { publicKey: wrongKey } = await service.regenerateKeypair(0, 1);
      expect(await service.verifyAddress(0, 0, wrongKey)).toBe(false);
    });
  });

  describe("hex seed expansion (HMAC-SHA512)", () => {
    const hex32 =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    it("should derive stable addresses that regenerate from the same seed", async () => {
      const s1 = new HDWalletService(hex32);
      const derived: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { publicKey } = await s1.regenerateKeypair(0, i);
        derived.push(publicKey);
      }

      const s2 = new HDWalletService(hex32);
      for (let i = 0; i < 5; i++) {
        const { publicKey } = await s2.regenerateKeypair(0, i);
        expect(publicKey).toBe(derived[i]);
      }
    });

    it("should not match naive seed32||seed32 concatenation expansion", async () => {
      const crypto = require("crypto");
      const { derivePath } = require("ed25519-hd-key");
      const { Keypair } = require("@stellar/stellar-sdk");

      const seed32 = Buffer.from(hex32, "hex");
      const hmacSeed = crypto
        .createHmac("sha512", "ed25519 seed")
        .update(seed32)
        .digest();
      const concatSeed = Buffer.concat([seed32, seed32]);

      const path = "m/44'/148'/0'/0'";
      const hmacKey = Keypair.fromRawEd25519Seed(
        Buffer.from(derivePath(path, hmacSeed.toString("hex")).key),
      );
      const concatKey = Keypair.fromRawEd25519Seed(
        Buffer.from(derivePath(path, concatSeed.toString("hex")).key),
      );

      expect(hmacKey.publicKey()).not.toBe(concatKey.publicKey());

      const serviceHex = new HDWalletService(hex32);
      const { publicKey } = await serviceHex.regenerateKeypair(0, 0);
      expect(publicKey).toBe(hmacKey.publicKey());
    });
  });
});
