/**
 * HDWalletService BIP44 Derivation Tests
 *
 * Tests BIP44 address derivation, atomic index management (mocked DB),
 * derivation path correctness, and encrypted_key_data round-trip.
 */
import { HDWalletService } from "../HDWalletService";

// Mock Prisma so we don't need a real DB in CI
jest.mock("../../generated/client/client", () => {
  let globalCounter = 0;
  const merchantCounters: Record<string, number> = {};
  const merchantIndices: Record<string, number> = {};

  const mockTx = {
    merchantHDIndex: {
      findUnique: jest.fn(({ where }: any) => {
        const idx = merchantIndices[where.merchantId];
        if (idx !== undefined) {
          return Promise.resolve({
            merchantId: where.merchantId,
            merchant_index: idx,
            payment_counter: merchantCounters[where.merchantId] ?? 0,
          });
        }
        return Promise.resolve(null);
      }),
      create: jest.fn(({ data }: any) => {
        merchantIndices[data.merchantId] = data.merchant_index;
        merchantCounters[data.merchantId] = 0;
        return Promise.resolve(data);
      }),
    },
    hDIndexCounter: {
      upsert: jest.fn(() =>
        Promise.resolve({ id: "global", next_merchant_index: globalCounter }),
      ),
      update: jest.fn(() => {
        globalCounter++;
        return Promise.resolve({
          id: "global",
          next_merchant_index: globalCounter,
        });
      }),
    },
  };

  const mockPrisma = {
    $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => fn(mockTx)),
    merchantHDIndex: {
      findUnique: jest.fn(({ where }: any) => {
        const idx = merchantIndices[where.merchantId];
        if (idx !== undefined) {
          return Promise.resolve({
            merchantId: where.merchantId,
            merchant_index: idx,
            payment_counter: merchantCounters[where.merchantId] ?? 0,
          });
        }
        return Promise.resolve(null);
      }),
      update: jest.fn(({ where, data }: any) => {
        if (data.payment_counter?.increment) {
          merchantCounters[where.merchantId] =
            (merchantCounters[where.merchantId] ?? 0) +
            data.payment_counter.increment;
        }
        return Promise.resolve({
          merchantId: where.merchantId,
          merchant_index: merchantIndices[where.merchantId],
          payment_counter: merchantCounters[where.merchantId],
        });
      }),
    },
    payment: {
      findUnique: jest.fn(({ where }: any) => {
        return Promise.resolve({ id: where.id, payment_index: 0 });
      }),
    },
  };

  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe("HDWalletService – BIP44 Derivation", () => {
  const masterSeed = "test-master-seed-bip44-deterministic-1234567890abcdef";
  let service: HDWalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HDWalletService(masterSeed);
  });

  describe("constructor", () => {
    it("should throw if empty string master seed is provided", () => {
      expect(() => new HDWalletService("")).toThrow("Master seed is required");
    });
  });

  describe("derivePaymentAddress", () => {
    it("should return a valid Stellar public key", async () => {
      const result = await service.derivePaymentAddress(
        "merchant_A",
        "payment_1",
      );
      expect(result.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
    });

    it("should include correct derivation path format", async () => {
      const result = await service.derivePaymentAddress(
        "merchant_A",
        "payment_2",
      );
      expect(result.derivationPath).toMatch(/^m\/44'\/148'\/\d+'\/\d+'$/);
    });

    it("should return merchantIndex and paymentIndex", async () => {
      const result = await service.derivePaymentAddress(
        "merchant_A",
        "payment_3",
      );
      expect(typeof result.merchantIndex).toBe("number");
      expect(typeof result.paymentIndex).toBe("number");
    });

    it("should produce different addresses for different merchants", async () => {
      const r1 = await service.derivePaymentAddress("merchant_X", "pay_1");
      const r2 = await service.derivePaymentAddress("merchant_Y", "pay_1");
      expect(r1.publicKey).not.toBe(r2.publicKey);
    });
  });

  describe("regenerateKeypairFromPath", () => {
    it("should regenerate same keypair from derivation path", async () => {
      const derived = await service.derivePaymentAddress(
        "merchant_A",
        "pay_regen",
      );
      const { publicKey, secretKey } = await service.regenerateKeypairFromPath(
        derived.derivationPath,
      );

      expect(publicKey).toBe(derived.publicKey);
      expect(publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(secretKey).toMatch(/^S[A-Z0-9]{55}$/);
    });

    it("should be deterministic across calls", async () => {
      const path = "m/44'/148'/0'/0'";
      const kp1 = await service.regenerateKeypairFromPath(path);
      const kp2 = await service.regenerateKeypairFromPath(path);
      expect(kp1.publicKey).toBe(kp2.publicKey);
      expect(kp1.secretKey).toBe(kp2.secretKey);
    });
  });

  describe("regenerateKeypair (numeric indices)", () => {
    it("should accept numeric indices directly", async () => {
      const { publicKey, secretKey } = await service.regenerateKeypair(0, 0);
      expect(publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(secretKey).toMatch(/^S[A-Z0-9]{55}$/);
    });

    it("should produce same result as regenerateKeypairFromPath", async () => {
      const kpFromIndices = await service.regenerateKeypair(2, 5);
      const kpFromPath =
        await service.regenerateKeypairFromPath("m/44'/148'/2'/5'");
      expect(kpFromIndices.publicKey).toBe(kpFromPath.publicKey);
    });
  });

  describe("verifyAddress", () => {
    it("should return true for correctly derived address", async () => {
      const { publicKey } =
        await service.regenerateKeypairFromPath("m/44'/148'/1'/3'");
      const valid = await service.verifyAddress(1, 3, publicKey);
      expect(valid).toBe(true);
    });

    it("should return false for wrong address", async () => {
      const { publicKey: wrongKey } =
        await service.regenerateKeypairFromPath("m/44'/148'/1'/4'");
      const valid = await service.verifyAddress(1, 3, wrongKey);
      expect(valid).toBe(false);
    });
  });

  describe("encryptKeyData / decryptKeyData", () => {
    it("should encrypt and decrypt indices round-trip", async () => {
      const encrypted = await service.encryptKeyData(3, 7);
      expect(typeof encrypted).toBe("string");
      expect(encrypted.length).toBeGreaterThan(10);

      const { merchantIndex, paymentIndex } =
        await service.decryptKeyData(encrypted);
      expect(merchantIndex).toBe(3);
      expect(paymentIndex).toBe(7);
    });

    it("should produce different ciphertext on each call (random IV)", async () => {
      const enc1 = await service.encryptKeyData(1, 2);
      const enc2 = await service.encryptKeyData(1, 2);
      expect(enc1).not.toBe(enc2); // Different IV → different ciphertext
    });

    it("should fail to decrypt altered ciphertext", async () => {
      const enc = await service.encryptKeyData(0, 0);
      const tampered = enc.slice(0, -4) + "dead"; // corrupt last bytes
      await expect(service.decryptKeyData(tampered)).rejects.toThrow();
    });
  });

  describe("index persistence and restart simulation", () => {
    it("should persist merchant_index across service restart", async () => {
      // First instance: derive address for merchant_restart_test
      const result1 = await service.derivePaymentAddress(
        "merchant_restart_test",
        "payment_1"
      );
      const merchantIndex1 = result1.merchantIndex;

      // Simulate restart by creating a new service instance
      const newService = new HDWalletService("test-master-seed-bip44-deterministic-1234567890abcdef");

      // Second instance: derive another address for same merchant
      const result2 = await newService.derivePaymentAddress(
        "merchant_restart_test",
        "payment_2"
      );
      const merchantIndex2 = result2.merchantIndex;

      // merchant_index should be the same (persisted in DB)
      expect(merchantIndex1).toBe(merchantIndex2);
    });

    it("should increment payment_counter across restart", async () => {
      const merchantId = "merchant_counter_test";

      // First instance: derive first address
      const result1 = await service.derivePaymentAddress(merchantId, "pay_1");
      expect(result1.paymentIndex).toBe(0);

      // Second instance (simulated restart)
      const newService = new HDWalletService("test-master-seed-bip44-deterministic-1234567890abcdef");

      // Derive second address - should increment payment counter
      const result2 = await newService.derivePaymentAddress(merchantId, "pay_2");
      expect(result2.paymentIndex).toBe(1);

      // Third address - should increment again
      const result3 = await newService.derivePaymentAddress(merchantId, "pay_3");
      expect(result3.paymentIndex).toBe(2);
    });

    it("should not reset global merchant_index counter on restart", async () => {
      // First instance: assign indices to multiple merchants
      const merchant1 = await service.derivePaymentAddress("new_merchant_1", "pay_1");
      const merchant2 = await service.derivePaymentAddress("new_merchant_2", "pay_1");
      const merchant3 = await service.derivePaymentAddress("new_merchant_3", "pay_1");

      // All should have different merchant indices
      expect(merchant1.merchantIndex).not.toBe(merchant2.merchantIndex);
      expect(merchant2.merchantIndex).not.toBe(merchant3.merchantIndex);
      expect(merchant1.merchantIndex).not.toBe(merchant3.merchantIndex);

      // Second instance (simulated restart): new merchant should get next index
      const newService = new HDWalletService("test-master-seed-bip44-deterministic-1234567890abcdef");
      const merchant4 = await newService.derivePaymentAddress("new_merchant_4", "pay_1");

      // Should get a higher merchant_index, not restart from 0
      expect(merchant4.merchantIndex).toBeGreaterThan(merchant3.merchantIndex);
    });

    it("should produce same public key after restart when using same indices", async () => {
      const derivedAddress = await service.derivePaymentAddress("merchant_pk_test", "pay_1");
      const publicKey1 = derivedAddress.publicKey;
      const merchantIndex = derivedAddress.merchantIndex;
      const paymentIndex = derivedAddress.paymentIndex;

      // Simulate restart: create new service and regenerate with same indices
      const newService = new HDWalletService("test-master-seed-bip44-deterministic-1234567890abcdef");
      const { publicKey: publicKey2 } = await newService.regenerateKeypair(
        merchantIndex,
        paymentIndex
      );

      // Should produce the same public key
      expect(publicKey1).toBe(publicKey2);
    });

    it("should log derived address with index for audit", async () => {
      const logSpy = jest.spyOn(console, "log").mockImplementation();

      const result = await service.derivePaymentAddress("merchant_audit", "pay_audit");

      // Verify audit log was created
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("HD wallet address derived")
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(result.publicKey)
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"merchantIndex":${result.merchantIndex}`)
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`"paymentIndex":${result.paymentIndex}`)
      );

      logSpy.mockRestore();
    });
  });
});
