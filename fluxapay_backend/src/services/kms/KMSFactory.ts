import { IKMSProvider } from './IKMSProvider';
import { AWSKMSProvider } from './AWSKMSProvider';
import { LocalKMSProvider } from './LocalKMSProvider';

/**
 * KMS Factory
 * Creates the appropriate KMS provider based on environment configuration
 */
export class KMSFactory {
  private static instance: IKMSProvider | null = null;

  /**
   * Gets or creates a KMS provider instance (singleton)
   */
  static getProvider(): IKMSProvider {
    if (this.instance) {
      return this.instance;
    }

    const kmsProvider = process.env.KMS_PROVIDER || 'local';

    switch (kmsProvider.toLowerCase()) {
      case 'aws':
        this.instance = this.createAWSProvider();
        break;
      
      case 'local':
      default:
        this.instance = this.createLocalProvider();
        break;
    }

    return this.instance;
  }

  /**
   * Creates an AWS KMS provider
   */
  private static createAWSProvider(): AWSKMSProvider {
    const keyId = process.env.AWS_KMS_KEY_ID;
    const region = process.env.AWS_REGION || 'us-east-1';

    if (!keyId) {
      throw new Error('AWS_KMS_KEY_ID is required when KMS_PROVIDER=aws');
    }

    console.log(`🔐 Initializing AWS KMS provider (region: ${region})`);
    return new AWSKMSProvider(keyId, region);
  }

  /**
   * Creates a local KMS provider
   */
  private static createLocalProvider(): LocalKMSProvider {
    console.log('🔐 Initializing Local KMS provider (development mode)');
    return new LocalKMSProvider();
  }

  /**
   * Resets the singleton instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * Sets a custom provider (useful for testing)
   */
  static setProvider(provider: IKMSProvider): void {
    this.instance = provider;
  }
}
