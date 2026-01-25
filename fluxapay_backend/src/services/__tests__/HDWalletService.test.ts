import { HDWalletService } from '../HDWalletService';

describe('HDWalletService', () => {
    const masterSeed = 'test-master-seed-123';
    let service: HDWalletService;

    beforeEach(() => {
        service = new HDWalletService(masterSeed);
    });

    describe('constructor', () => {
        it('should throw error if master seed is missing', () => {
            expect(() => new HDWalletService('')).toThrow('Master seed is required');
        });
    });

    describe('derivePaymentAddress', () => {
        it('should derive deterministic addresses', () => {
            const merchantId = 'merchant_1';
            const paymentId = 'payment_A';

            const address1 = service.derivePaymentAddress(merchantId, paymentId);
            const address2 = service.derivePaymentAddress(merchantId, paymentId);

            expect(address1).toBe(address2);
            expect(address1).toMatch(/^G[A-Z0-9]{55}$/); // Basic Stellar address regex
        });

        it('should derive different addresses for different payment IDs', () => {
            const merchantId = 'merchant_1';
            const address1 = service.derivePaymentAddress(merchantId, 'payment_A');
            const address2 = service.derivePaymentAddress(merchantId, 'payment_B');

            expect(address1).not.toBe(address2);
        });

        it('should derive different addresses for different merchant IDs', () => {
            const paymentId = 'payment_A';
            const address1 = service.derivePaymentAddress('merchant_1', paymentId);
            const address2 = service.derivePaymentAddress('merchant_2', paymentId);

            expect(address1).not.toBe(address2);
        });
    });

    describe('regenerateKeypair', () => {
        it('should regenerate the correct keypair', () => {
            const merchantId = 'merchant_1';
            const paymentId = 'payment_A';

            const { publicKey, secretKey } = service.regenerateKeypair(merchantId, paymentId);
            const derivedAddress = service.derivePaymentAddress(merchantId, paymentId);

            expect(publicKey).toBe(derivedAddress);
            expect(secretKey).toMatch(/^S[A-Z0-9]{55}$/); // Basic Stellar secret key regex
        });
    });

    describe('verifyAddress', () => {
        it('should return true for correct address', () => {
            const merchantId = 'merchant_1';
            const paymentId = 'payment_A';
            const address = service.derivePaymentAddress(merchantId, paymentId);

            expect(service.verifyAddress(merchantId, paymentId, address)).toBe(true);
        });

        it('should return false for incorrect address', () => {
            const merchantId = 'merchant_1';
            const paymentId = 'payment_A';
            const otherAddress = service.derivePaymentAddress(merchantId, 'payment_B');

            expect(service.verifyAddress(merchantId, paymentId, otherAddress)).toBe(false);
        });
    });
});
