import { Keypair } from '@stellar/stellar-sdk';
import crypto from 'crypto';

export class HDWalletService {
    private masterSeed: string;

    constructor(masterSeed: string) {
        if (!masterSeed) {
            throw new Error('Master seed is required');
        }
        this.masterSeed = masterSeed;
    }

    /**
     * Generates a deterministic seed based on the master seed, merchant ID, and payment ID.
     * Uses SHA-256 to ensure a 32-byte seed for Ed25519.
     */
    private generateSeed(merchantId: string, paymentId: string): Buffer {
        const data = `${this.masterSeed}:${merchantId}:${paymentId}`;
        return crypto.createHash('sha256').update(data).digest();
    }

    /**
     * Derives the public Stellar address for a specific payment.
     */
    public derivePaymentAddress(merchantId: string, paymentId: string): string {
        const seed = this.generateSeed(merchantId, paymentId);
        const keypair = Keypair.fromRawEd25519Seed(seed);
        return keypair.publicKey();
    }

    /**
     * Regenerates the full keypair (public and secret key) for a specific payment.
     * Useful for sweeping funds.
     */
    public regenerateKeypair(merchantId: string, paymentId: string): { publicKey: string; secretKey: string } {
        const seed = this.generateSeed(merchantId, paymentId);
        const keypair = Keypair.fromRawEd25519Seed(seed);
        return {
            publicKey: keypair.publicKey(),
            secretKey: keypair.secret(),
        };
    }

    /**
     * Verifies if a given public key corresponds to the derived address for the inputs.
     */
    public verifyAddress(merchantId: string, paymentId: string, publicKey: string): boolean {
        const derivedAddress = this.derivePaymentAddress(merchantId, paymentId);
        return derivedAddress === publicKey;
    }
}
