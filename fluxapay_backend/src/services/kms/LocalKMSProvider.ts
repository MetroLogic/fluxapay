import crypto from "crypto";
import { IKMSProvider } from "./IKMSProvider";
import {
  getActiveKeyVersion,
  parseEnvelope,
  wrapEnvelope,
} from "./keyVersioning";

/**
 * Local KMS Provider
 * Development/testing implementation using local encryption
 *
 * WARNING: This is NOT suitable for production use!
 * Use AWS KMS or another HSM-backed solution in production.
 *
 * Features:
 * - AES-256-GCM encryption
 * - Local key derivation from passphrase
 * - No external dependencies
 */
export class LocalKMSProvider implements IKMSProvider {
  private encryptionKey: Buffer;
  private cachedSeed: string | null = null;

  constructor(passphrase?: string) {
    // Derive encryption key from passphrase or environment variable
    const secret =
      passphrase ||
      process.env.KMS_ENCRYPTION_PASSPHRASE ||
      "default-dev-passphrase";

    if (secret === "default-dev-passphrase") {
      console.warn(
        "⚠️  WARNING: Using default encryption passphrase. Set KMS_ENCRYPTION_PASSPHRASE for better security.",
      );
    }

    // Derive a 32-byte key using PBKDF2
    this.encryptionKey = crypto.pbkdf2Sync(
      secret,
      "fluxapay-kms-salt", // Static salt for deterministic key derivation
      100000,
      32,
      "sha256",
    );
  }

  /**
   * Retrieves and decrypts the master seed from environment variable
   */
  async getMasterSeed(): Promise<string> {
    if (this.cachedSeed) {
      return this.cachedSeed;
    }

    const encryptedSeed = process.env.KMS_ENCRYPTED_MASTER_SEED;

    if (!encryptedSeed) {
      // Fallback to plain-text for backward compatibility (development only)
      const plainSeed = process.env.HD_WALLET_MASTER_SEED;
      if (plainSeed) {
        console.warn(
          "⚠️  WARNING: Using plain-text HD_WALLET_MASTER_SEED. Migrate to encrypted KMS_ENCRYPTED_MASTER_SEED.",
        );
        this.cachedSeed = plainSeed;
        return plainSeed;
      }
      throw new Error(
        "Neither KMS_ENCRYPTED_MASTER_SEED nor HD_WALLET_MASTER_SEED is configured",
      );
    }

    try {
      const decrypted = this._decrypt(encryptedSeed);
      this.cachedSeed = decrypted;
      return decrypted;
    } catch (error) {
      console.error("Failed to decrypt master seed:", error);
      throw new Error("Failed to decrypt master seed");
    }
  }

  /**
   * Encrypts and stores the master seed
   * Outputs the encrypted value to be stored in environment variable
   */
  async storeMasterSeed(seed: string): Promise<void> {
    const encrypted = this.encrypt(seed);
    console.log(
      "Encrypted master seed (store this in KMS_ENCRYPTED_MASTER_SEED):",
    );
    console.log(encrypted);
    this.cachedSeed = seed;
  }

  /**
   * Encrypts data using AES-256-GCM (implements IKMSProvider.encrypt)
   */
  async encrypt(plaintext: string): Promise<string> {
    return this._encrypt(plaintext);
  }

  /**
   * Decrypts data using AES-256-GCM (implements IKMSProvider.decrypt)
   */
  async decrypt(ciphertext: string): Promise<string> {
    return this._decrypt(ciphertext);
  }

  /**
   * Resolves the key for a version. Version 1 is the primary key; later
   * versions are derived from KMS_ENCRYPTION_PASSPHRASE_V<N>.
   */
  private keyForVersion(version: number): Buffer {
    if (version === 1) return this.encryptionKey;
    const secret = process.env[`KMS_ENCRYPTION_PASSPHRASE_V${version}`];
    if (!secret) {
      throw new Error(`No encryption key configured for key version v${version}`);
    }
    return crypto.pbkdf2Sync(secret, "fluxapay-kms-salt", 100000, 32, "sha256");
  }

  /**
   * Encrypts data using AES-256-GCM under the active key version.
   * Format: v<N>$iv:authTag:ciphertext
   */
  private _encrypt(plaintext: string): string {
    const version = getActiveKeyVersion();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      this.keyForVersion(version),
      iv,
    );

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return wrapEnvelope(
      version,
      `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`,
    );
  }

  /**
   * Decrypts data using AES-256-GCM
   */
  private _decrypt(envelope: string): string {
    // Unversioned legacy ciphertext is treated as v1.
    const { version, body: ciphertext } = parseEnvelope(envelope);
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.keyForVersion(version),
      iv,
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Rotates the encryption key by re-encrypting the master seed with a new passphrase
   * Returns the new encrypted seed to be stored in environment
   */
  async rotateEncryptionKey(newPassphrase: string): Promise<string> {
    // 1. Decrypt the current master seed with old key
    const currentSeed = await this.getMasterSeed();

    // 2. Derive new encryption key from new passphrase
    const newEncryptionKey = crypto.pbkdf2Sync(
      newPassphrase,
      "fluxapay-kms-salt",
      100000,
      32,
      "sha256",
    );

    // 3. Encrypt the seed with the new key
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", newEncryptionKey, iv);

    let encrypted = cipher.update(currentSeed, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    const newEncryptedSeed = `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;

    // 4. Update the internal encryption key to the new one
    this.encryptionKey = newEncryptionKey;
    this.cachedSeed = null; // Invalidate cache

    console.log("✅ Encryption key rotated successfully");
    console.log("New KMS_ENCRYPTED_MASTER_SEED:", newEncryptedSeed);
    console.log("Update your environment variable with the new value");

    return newEncryptedSeed;
  }

  /**
   * Local KMS is always "healthy" if the key is derived
   */
  async healthCheck(): Promise<boolean> {
    return this.encryptionKey.length === 32;
  }
}
