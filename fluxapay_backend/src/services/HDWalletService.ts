import { Keypair } from '@stellar/stellar-sdk';
import crypto from 'crypto';
import { IKMSProvider, KMSFactory } from './kms';

export class HDWalletService {
    private masterSeed: string | null = null;
    private kmsProvider: IKMSProvider;

    constructor(masterSeedOrKmsProvider?: string | IKMSProvider) {
        if (typeof masterSeedOrKmsProvider === 'string') {
            // Legacy: Direct seed injection (for testing)
            if (!masterSeedOrKmsProvider) {
                throw new Error('Master seed is required');
            }
            this.masterSeed = masterSeedOrKmsProvider;
            // Create a mock KMS provider that returns the injected seed
            this.kmsProvider = {
                getMasterSeed: async () => this.masterSeed!,
                storeMasterSeed: async () => {},
                healthCheck: async () => true,
            };
        } else if (masterSeedOrKmsProvider) {
            // Custom KMS provider injection (for testing)
            this.kmsProvider = masterSeedOrKmsProvider;
        } else {
            // Production: Use KMS factory
            this.kmsProvider = KMSFactory.getProvider();
        }
    }

    /**
     * Retrieves the master seed from KMS (with caching)
     */
    private async getMasterSeed(): Promise<string> {
        if (this.masterSeed) {
            return this.masterSeed;
        }
        this.masterSeed = await this.kmsProvider.getMasterSeed();
        return this.masterSeed;
    }

    /**
     * Generates a deterministic seed based on the master seed, merchant ID, and payment ID.
     * Uses SHA-256 to ensure a 32-byte seed for Ed25519.
     */
    private async generateSeed(merchantId: string, paymentId: string): Promise<Buffer> {
        const masterSeed = await this.getMasterSeed();
        const data = `${masterSeed}:${merchantId}:${paymentId}`;
        return crypto.createHash('sha256').update(data).digest();
    }

    /**
     * Derives the public Stellar address for a specific payment.
     */
    public async derivePaymentAddress(merchantId: string, paymentId: string): Promise<string> {
        const seed = await this.generateSeed(merchantId, paymentId);
        const keypair = Keypair.fromRawEd25519Seed(seed);
        return keypair.publicKey();
    }

    /**
     * Regenerates the full keypair (public and secret key) for a specific payment.
     * Useful for sweeping funds.
     */
    public async regenerateKeypair(merchantId: string, paymentId: string): Promise<{ publicKey: string; secretKey: string }> {
        const seed = await this.generateSeed(merchantId, paymentId);
        const keypair = Keypair.fromRawEd25519Seed(seed);
        return {
            publicKey: keypair.publicKey(),
            secretKey: keypair.secret(),
        };
    }

    /**
     * Verifies if a given public key corresponds to the derived address for the inputs.
     */
    public async verifyAddress(merchantId: string, paymentId: string, publicKey: string): Promise<boolean> {
        const derivedAddress = await this.derivePaymentAddress(merchantId, paymentId);
        return derivedAddress === publicKey;
    }
}
