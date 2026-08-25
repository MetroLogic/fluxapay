import { Keypair } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';
import { derivePath } from "ed25519-hd-key";
import { PrismaClient } from "../generated/client/client";
import { IKMSProvider, KMSFactory } from "./kms";

import { prisma } from "../config/prisma";

/**
 * Coin type 148 = Stellar (SLIP-0044)
 * Derivation path: m/44'/148'/<merchantIndex>'/<paymentIndex>'
 */
const STELLAR_COIN_TYPE = 148;

export interface DerivedAddress {
  publicKey: string;
  merchantIndex: number;
  paymentIndex: number;
  derivationPath: string;
}

export class HDWalletService {
  private static versionedSeeds: Map<number, string> = new Map();
  private masterSeed: string | null = null;
  private kmsProvider: IKMSProvider;

  /**
   * Statically registers a seed string for a specific seed version (useful for tests and rotation).
   */
  public static registerSeed(version: number, seed: string): void {
    HDWalletService.versionedSeeds.set(version, seed);
  }

  /**
   * Clears registered versioned seeds.
   */
  public static clearRegisteredSeeds(): void {
    HDWalletService.versionedSeeds.clear();
  }

  constructor(masterSeedOrKmsProvider?: string | IKMSProvider) {
    if (typeof masterSeedOrKmsProvider === "string") {
      // Legacy / test: Direct seed injection
      if (!masterSeedOrKmsProvider) {
        throw new Error("Master seed is required");
      }
      this.masterSeed = masterSeedOrKmsProvider;
      this.kmsProvider = {
        getMasterSeed: async () => this.masterSeed!,
        storeMasterSeed: async () => {},
        healthCheck: async () => true,
        encrypt: async (data: string) => this._localEncrypt(data),
        decrypt: async (data: string) => this._localDecrypt(data),
      };
    } else if (masterSeedOrKmsProvider) {
      // Custom KMS provider injection (for testing)
      this.kmsProvider = masterSeedOrKmsProvider;
    } else {
      // Production: Use KMS factory
      this.kmsProvider = KMSFactory.getProvider();
    }
  }

  // ─── KMS Retrieval ────────────────────────────────────────────────────────

  /**
   * Retrieves the master seed for a given seedVersion from registry, env, or KMS.
   */
  public async getMasterSeed(seedVersion: number = 1): Promise<string> {
    // 1. Check versioned registry
    if (HDWalletService.versionedSeeds.has(seedVersion)) {
      return HDWalletService.versionedSeeds.get(seedVersion)!;
    }

    // 2. Check environment variable for versioned seed
    const envVersionKey = `HD_WALLET_SEED_V${seedVersion}`;
    const envMasterKey = `HD_WALLET_MASTER_SEED_V${seedVersion}`;
    const envKmsKey = `KMS_ENCRYPTED_MASTER_SEED_V${seedVersion}`;

    if (process.env[envVersionKey]) {
      return process.env[envVersionKey]!;
    }
    if (process.env[envMasterKey]) {
      return process.env[envMasterKey]!;
    }
    if (process.env[envKmsKey] && this.kmsProvider.decrypt) {
      return await this.kmsProvider.decrypt(process.env[envKmsKey]!);
    }

    // 3. Default current master seed
    if (this.masterSeed) {
      return this.masterSeed;
    }
    this.masterSeed = await this.kmsProvider.getMasterSeed();
    return this.masterSeed;
  }

  // ─── BIP44 Core Derivation ────────────────────────────────────────────────

  /**
   * Converts the master seed string for seedVersion to 64-byte seed buffer.
   * Supports both raw hex (64 chars = 32 bytes expanded to 64) and plain strings.
   *
   * A 32-byte hex seed is expanded with HMAC-SHA512("ed25519 seed", seed32) per
   * SLIP-0010 style expansion — never by concatenating the seed with itself.
   */
  public async getSeedBuffer(seedVersion: number = 1): Promise<Buffer> {
    const masterSeed = await this.getMasterSeed(seedVersion);

    // 64-char hex → 32 bytes; expand to 64 bytes via HMAC-SHA512 (not concat)
    if (/^[0-9a-fA-F]{64}$/.test(masterSeed)) {
      const seed32 = Buffer.from(masterSeed, "hex");
      return crypto.createHmac("sha512", "ed25519 seed").update(seed32).digest();
    }

    // Otherwise hash to get deterministic 64-byte seed
    const hash = crypto.createHash("sha512").update(masterSeed).digest();
    return hash;
  }

  /**
   * Derives an Ed25519 keypair using BIP44 path: m/44'/148'/{merchantIndex}'/{paymentIndex}'
   */
  private async deriveKeypairFromPath(
    merchantIndex: number,
    paymentIndex: number,
    seedVersion: number = 1,
  ): Promise<{
    publicKey: string;
    secretKey: string;
    derivationPath: string;
  }> {
    const path = `m/44'/${STELLAR_COIN_TYPE}'/${merchantIndex}'/${paymentIndex}'`;
    const seedBuffer = await this.getSeedBuffer(seedVersion);

    // Derive the Ed25519 key
    const { key } = derivePath(path, seedBuffer.toString("hex"));

    // Stellar Keypair from 32-byte private key
    const keypair = Keypair.fromRawEd25519Seed(Buffer.from(key));
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
      derivationPath: path,
    };
  }

  // ─── Atomic Index Management (PostgreSQL) ─────────────────────────────────

  /**
   * Gets or creates the stable merchant_index for a merchant.
   * Uses a DB transaction to ensure atomicity.
   */
  private async getMerchantIndex(merchantId: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
      // Check if merchant already has an index
      const existing = await tx.merchantHDIndex.findUnique({
        where: { merchantId },
      });

      if (existing) {
        return existing.merchant_index;
      }

      // Atomically increment the global counter and claim a new index
      // Upsert the global counter row first (ensures it exists)
      await tx.hDIndexCounter.upsert({
        where: { id: "global" },
        create: { id: "global", next_merchant_index: 0 },
        update: {},
      });

      // Atomically fetch-and-increment
      const updated = await tx.hDIndexCounter.update({
        where: { id: "global" },
        data: { next_merchant_index: { increment: 1 } },
      });

      const assignedIndex = updated.next_merchant_index - 1;

      // Assign this index to the merchant
      await tx.merchantHDIndex.create({
        data: {
          merchantId,
          merchant_index: assignedIndex,
          payment_counter: 0,
        },
      });

      return assignedIndex;
    });
  }

  /**
   * Atomically increments and returns the next payment_index for a merchant.
   */
  private async getNextPaymentIndex(merchantId: string): Promise<number> {
    // Ensure merchant has an HD index record
    await this.getMerchantIndex(merchantId);

    // Atomically increment payment_counter
    const updated = await prisma.merchantHDIndex.update({
      where: { merchantId },
      data: { payment_counter: { increment: 1 } },
    });

    // Return the previous value (pre-increment = the index for this payment)
    return updated.payment_counter - 1;
  }

  // ─── KMS Encryption for Key Data ─────────────────────────────────────────

  /**
   * Encrypts the derivation indices using KMS for secure storage.
   */
  async encryptKeyData(
    merchantIndex: number,
    paymentIndex: number,
  ): Promise<string> {
    const payload = JSON.stringify({ merchantIndex, paymentIndex });

    if (this.kmsProvider.encrypt) {
      return this.kmsProvider.encrypt(payload);
    }

    // Fallback: local AES-GCM using a derived key from the master seed
    return this._localEncrypt(payload);
  }

  /**
   * Decrypts the stored key data back to indices.
   */
  async decryptKeyData(
    encrypted: string,
  ): Promise<{ merchantIndex: number; paymentIndex: number }> {
    let payload: string;

    if (this.kmsProvider.decrypt) {
      payload = await this.kmsProvider.decrypt(encrypted);
    } else {
      payload = this._localDecrypt(encrypted);
    }

    return JSON.parse(payload);
  }

  /**
   * Local AES-256-GCM encrypt (used when no KMS encrypt available)
   */
  private _localEncrypt(plaintext: string): string {
    const seed = this.masterSeed || "default-hd-key";
    const key = crypto
      .createHash("sha256")
      .update(seed + ":hd-key-data")
      .digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let enc = cipher.update(plaintext, "utf8", "hex");
    enc += cipher.final("hex");
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${enc}`;
  }

  /**
   * Local AES-256-GCM decrypt
   */
  private _localDecrypt(ciphertext: string): string {
    const parts = ciphertext.split(":");
    if (parts.length !== 3)
      throw new Error("Invalid encrypted key data format");
    const seed = this.masterSeed || "default-hd-key";
    const key = crypto
      .createHash("sha256")
      .update(seed + ":hd-key-data")
      .digest();
    const iv = Buffer.from(parts[0], "hex");
    const tag = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(parts[2], "hex", "utf8");
    dec += decipher.final("utf8");
    return dec;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Derives the payment address using BIP44 path.
   * Atomically assigns merchant_index and payment_index counters in DB.
   * Returns full derivation metadata for storage on the Payment row.
   * Logs derived address with index for audit trail.
   */
  public async derivePaymentAddress(
    merchantId: string,
    paymentId: string,
    seedVersion: number = 1,
  ): Promise<DerivedAddress> {
    const merchantIndex = await this.getMerchantIndex(merchantId);
    const paymentIndex = await this.getNextPaymentIndex(merchantId);

    const { publicKey, derivationPath } = await this.deriveKeypairFromPath(
      merchantIndex,
      paymentIndex,
      seedVersion,
    );

    // Log the derived address with indices for audit trail
    console.log(
      JSON.stringify({
        level: "info",
        message: "HD wallet address derived",
        paymentId,
        merchantId,
        publicKey,
        merchantIndex,
        paymentIndex,
        derivationPath,
        seedVersion,
        timestamp: new Date().toISOString(),
      }),
    );

    return {
      publicKey,
      merchantIndex,
      paymentIndex,
      derivationPath,
    };
  }

  /**
   * Regenerates the full keypair for sweeping.
   * Accepts explicit indices (from stored derivation_path or encrypted_key_data) — no DB required.
   * Alternatively, accepts merchantId/paymentId for backward-compatible DB lookup.
   */
  public async regenerateKeypair(
    merchantIdOrMerchantIndex: string | number,
    paymentIdOrPaymentIndex: string | number,
    seedVersion: number = 1,
  ): Promise<{ publicKey: string; secretKey: string }> {
    let merchantIndex: number;
    let paymentIndex: number;

    if (
      typeof merchantIdOrMerchantIndex === "number" &&
      typeof paymentIdOrPaymentIndex === "number"
    ) {
      // Direct index injection (for sweep using stored encrypted_key_data)
      merchantIndex = merchantIdOrMerchantIndex;
      paymentIndex = paymentIdOrPaymentIndex;
    } else {
      // String IDs: look up from DB
      const merchantId = merchantIdOrMerchantIndex as string;
      const record = await prisma.merchantHDIndex.findUnique({
        where: { merchantId },
      });
      if (!record) {
        throw new Error(`No HD index found for merchant ${merchantId}`);
      }
      merchantIndex = record.merchant_index;

      // paymentIndex for a specific payment is stored on the Payment row
      const payment = await prisma.payment.findUnique({
        where: { id: paymentIdOrPaymentIndex as string },
        select: { payment_index: true },
      });
      if (!payment || payment.payment_index === null) {
        throw new Error(
          `No payment_index stored for payment ${paymentIdOrPaymentIndex}`,
        );
      }
      paymentIndex = payment.payment_index;
    }

    const { publicKey, secretKey } = await this.deriveKeypairFromPath(
      merchantIndex,
      paymentIndex,
      seedVersion,
    );
    return { publicKey, secretKey };
  }

  /**
   * Regenerates keypair directly from a BIP44 derivation path string.
   * e.g. "m/44'/148'/3'/7'"
   */
  public async regenerateKeypairFromPath(
    derivationPath: string,
    seedVersion: number = 1,
  ): Promise<{ publicKey: string; secretKey: string }> {
    const seedBuffer = await this.getSeedBuffer(seedVersion);
    const { key } = derivePath(derivationPath, seedBuffer.toString("hex"));
    const keypair = Keypair.fromRawEd25519Seed(Buffer.from(key));
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  /**
   * Verifies if a given public key matches the BIP44-derived address for explicit indices.
   */
  public async verifyAddress(
    merchantIndex: number,
    paymentIndex: number,
    publicKey: string,
    seedVersion: number = 1,
  ): Promise<boolean> {
    const { publicKey: derived } = await this.deriveKeypairFromPath(
      merchantIndex,
      paymentIndex,
      seedVersion,
    );
    return derived === publicKey;
  }
}
