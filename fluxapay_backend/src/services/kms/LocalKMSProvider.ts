import crypto from 'crypto';
import { IKMSProvider } from './IKMSProvider';

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
    const secret = passphrase || process.env.KMS_ENCRYPTION_PASSPHRASE || 'default-dev-passphrase';
    
    if (secret === 'default-dev-passphrase') {
      console.warn('⚠️  WARNING: Using default encryption passphrase. Set KMS_ENCRYPTION_PASSPHRASE for better security.');
    }

    // Derive a 32-byte key using PBKDF2
    this.encryptionKey = crypto.pbkdf2Sync(
      secret,
      'fluxapay-kms-salt', // Static salt for deterministic key derivation
      100000,
      32,
      'sha256'
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
        console.warn('⚠️  WARNING: Using plain-text HD_WALLET_MASTER_SEED. Migrate to encrypted KMS_ENCRYPTED_MASTER_SEED.');
        this.cachedSeed = plainSeed;
        return plainSeed;
      }
      throw new Error('Neither KMS_ENCRYPTED_MASTER_SEED nor HD_WALLET_MASTER_SEED is configured');
    }

    try {
      const decrypted = this.decrypt(encryptedSeed);
      this.cachedSeed = decrypted;
      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt master seed:', error);
      throw new Error('Failed to decrypt master seed');
    }
  }

  /**
   * Encrypts and stores the master seed
   * Outputs the encrypted value to be stored in environment variable
   */
  async storeMasterSeed(seed: string): Promise<void> {
    const encrypted = this.encrypt(seed);
    console.log('Encrypted master seed (store this in KMS_ENCRYPTED_MASTER_SEED):');
    console.log(encrypted);
    this.cachedSeed = seed;
  }

  /**
   * Encrypts data using AES-256-GCM
   */
  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:ciphertext (all hex encoded)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts data using AES-256-GCM
   */
  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Local KMS is always "healthy" if the key is derived
   */
  async healthCheck(): Promise<boolean> {
    return this.encryptionKey.length === 32;
  }
}
