import { IKMSProvider } from "./IKMSProvider";

/**
 * AWS KMS Provider
 * Production-grade implementation using AWS Key Management Service
 *
 * Features:
 * - Hardware Security Module (HSM) backed encryption
 * - Automatic key rotation
 * - Audit logging via CloudTrail
 * - Fine-grained IAM access control
 */
export class AWSKMSProvider implements IKMSProvider {
  private kmsClient: any;
  private keyId: string;
  private encryptedSeed: string | null = null;
  private cachedSeed: string | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(keyId: string, region: string = "us-east-1") {
    this.keyId = keyId;

    // Lazy load AWS SDK to avoid requiring it in development
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {
        KMSClient,
        DecryptCommand,
        EncryptCommand,
      } = require("@aws-sdk/client-kms");
      this.kmsClient = new KMSClient({ region });
    } catch (error) {
      throw new Error(
        "AWS SDK not installed. Run: npm install @aws-sdk/client-kms",
      );
    }
  }

  /**
   * Retrieves and decrypts the master seed from AWS KMS
   * Implements caching to reduce KMS API calls
   */
  async getMasterSeed(): Promise<string> {
    // Return cached seed if still valid
    if (this.cachedSeed && Date.now() < this.cacheExpiry) {
      return this.cachedSeed;
    }

    if (!this.encryptedSeed) {
      // In production, this would be stored in AWS Secrets Manager or Parameter Store
      this.encryptedSeed = process.env.KMS_ENCRYPTED_MASTER_SEED || "";
      if (!this.encryptedSeed) {
        throw new Error("KMS_ENCRYPTED_MASTER_SEED not configured");
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DecryptCommand } = require("@aws-sdk/client-kms");

      const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(this.encryptedSeed, "base64"),
        KeyId: this.keyId,
      });

      const response = await this.kmsClient.send(command);
      const decryptedSeed = Buffer.from(response.Plaintext).toString("utf-8");

      // Cache the decrypted seed
      this.cachedSeed = decryptedSeed;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      return decryptedSeed;
    } catch (error) {
      console.error("Failed to decrypt master seed from AWS KMS:", error);
      throw new Error("Failed to retrieve master seed from KMS");
    }
  }

  /**
   * Encrypts and stores the master seed using AWS KMS
   * This should only be called during initial setup
   */
  async storeMasterSeed(seed: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EncryptCommand } = require("@aws-sdk/client-kms");

      const command = new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: Buffer.from(seed, "utf-8"),
      });

      const response = await this.kmsClient.send(command);
      this.encryptedSeed = Buffer.from(response.CiphertextBlob).toString(
        "base64",
      );

      console.log(
        "Encrypted master seed (store this in KMS_ENCRYPTED_MASTER_SEED):",
      );
      console.log(this.encryptedSeed);
    } catch (error) {
      console.error("Failed to encrypt master seed with AWS KMS:", error);
      throw new Error("Failed to store master seed in KMS");
    }
  }

  /**
   * Rotates the KMS encryption key by re-encrypting the master seed with a new KMS key
   *
   * AWS KMS supports automatic key rotation (yearly) which is transparent to the application.
   * This method is for manual rotation when switching to a completely new key ID.
   *
   * @param newKeyId - The new AWS KMS key ID to use for encryption
   * @returns The new encrypted seed (base64) to be stored in environment
   */
  async rotateEncryptionKey(newKeyId?: string): Promise<string> {
    if (!newKeyId) {
      console.log("ℹ️  AWS KMS automatic key rotation (recommended):");
      console.log("   1. Enable automatic key rotation in AWS Console");
      console.log("   2. AWS KMS rotates backing keys yearly (transparent to app)");
      console.log("   3. Old ciphertext remains decryptable with rotated key");
      console.log("");
      console.log("Manual key rotation (switching to new key ID):");
      console.log("   Call rotateEncryptionKey(newKeyId) with the new key ARN");
      throw new Error("newKeyId is required for manual key rotation");
    }

    try {
      // 1. Decrypt the master seed with the old key
      const currentSeed = await this.getMasterSeed();

      // 2. Create new KMS client with the new key
      const { EncryptCommand } = require("@aws-sdk/client-kms");

      const command = new EncryptCommand({
        KeyId: newKeyId,
        Plaintext: Buffer.from(currentSeed, "utf-8"),
      });

      const response = await this.kmsClient.send(command);
      const newEncryptedSeed = Buffer.from(response.CiphertextBlob).toString("base64");

      // 3. Update internal state
      this.keyId = newKeyId;
      this.encryptedSeed = newEncryptedSeed;
      this.cachedSeed = null; // Invalidate cache
      this.cacheExpiry = 0;

      console.log("✅ AWS KMS key rotated successfully");
      console.log("New Key ID:", newKeyId);
      console.log("New KMS_ENCRYPTED_MASTER_SEED:", newEncryptedSeed);
      console.log("");
      console.log("Next steps:");
      console.log("1. Update AWS_KMS_KEY_ID environment variable to:", newKeyId);
      console.log("2. Update KMS_ENCRYPTED_MASTER_SEED environment variable");
      console.log("3. Deploy the updated configuration");
      console.log("4. (Optional) Disable the old KMS key after verification");

      return newEncryptedSeed;
    } catch (error) {
      console.error("Failed to rotate AWS KMS key:", error);
      throw new Error("Failed to rotate AWS KMS key");
    }
  }

  /**
   * Encrypts data using AWS KMS (envelope encryption: AES-256-GCM with KMS data key)
   */
  async encrypt(data: string): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GenerateDataKeyCommand } = require("@aws-sdk/client-kms");
      const { createCipheriv, randomBytes } = await import("crypto");

      const command = new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: "AES_256",
      });
      const response = await this.kmsClient.send(command);
      const plainDataKey: Buffer = Buffer.from(response.Plaintext);
      const encryptedDataKey: string = Buffer.from(
        response.CiphertextBlob,
      ).toString("base64");

      const iv = randomBytes(16);
      const cipher = createCipheriv("aes-256-gcm", plainDataKey, iv);
      let enc = cipher.update(data, "utf8", "hex");
      enc += cipher.final("hex");
      const tag = cipher.getAuthTag();

      // Format: encryptedDataKey|iv|tag|ciphertext
      return `${encryptedDataKey}|${iv.toString("hex")}|${tag.toString("hex")}|${enc}`;
    } catch (error) {
      console.error("AWS KMS encrypt failed:", error);
      throw new Error("Failed to encrypt data with AWS KMS");
    }
  }

  /**
   * Decrypts data previously encrypted with encrypt()
   */
  async decrypt(data: string): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DecryptCommand } = require("@aws-sdk/client-kms");
      const { createDecipheriv } = await import("crypto");

      const [encryptedDataKey, ivHex, tagHex, ciphertext] = data.split("|");

      const decryptCommand = new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedDataKey, "base64"),
        KeyId: this.keyId,
      });
      const response = await this.kmsClient.send(decryptCommand);
      const plainDataKey: Buffer = Buffer.from(response.Plaintext);

      const iv = Buffer.from(ivHex, "hex");
      const tag = Buffer.from(tagHex, "hex");
      const decipher = createDecipheriv("aes-256-gcm", plainDataKey, iv);
      decipher.setAuthTag(tag);
      let dec = decipher.update(ciphertext, "hex", "utf8");
      dec += decipher.final("utf8");

      return dec;
    } catch (error) {
      console.error("AWS KMS decrypt failed:", error);
      throw new Error("Failed to decrypt data with AWS KMS");
    }
  }

  /**
   * Checks if AWS KMS is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DescribeKeyCommand } = require("@aws-sdk/client-kms");

      const command = new DescribeKeyCommand({ KeyId: this.keyId });
      await this.kmsClient.send(command);
      return true;
    } catch (error) {
      console.error("AWS KMS health check failed:", error);
      return false;
    }
  }
}
