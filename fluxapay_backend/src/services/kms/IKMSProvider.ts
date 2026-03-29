/**
 * KMS Provider Interface
 * Defines the contract for Key Management Service implementations
 */
export interface IKMSProvider {
  /**
   * Retrieves the master seed from secure storage
   * @returns Promise resolving to the decrypted master seed
   */
  getMasterSeed(): Promise<string>;

  /**
   * Encrypts and stores the master seed (for initial setup)
   * @param seed The master seed to encrypt and store
   */
  storeMasterSeed(seed: string): Promise<void>;

  /**
   * Rotates the master seed encryption key (if supported)
   */
  rotateEncryptionKey?(): Promise<void>;

  /**
   * Health check for KMS availability
   */
  healthCheck(): Promise<boolean>;

  /**
   * Encrypts arbitrary data using the KMS key material.
   * Used to encrypt derivation path indices before storing on Payment rows.
   */
  encrypt?(data: string): Promise<string>;

  /**
   * Decrypts data previously encrypted with encrypt().
   */
  decrypt?(data: string): Promise<string>;
}
