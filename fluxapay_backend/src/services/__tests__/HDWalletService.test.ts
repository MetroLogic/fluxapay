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
        it('should derive deterministic addresses', async () => {
            const merchantId = 'merchant_1';
            const paymentId = 'payment_A';

            const address1 = await service.derivePaymentAddress(merchantId, paymentId);
            const address2 = await service.derivePaymentAddress(merchantId, paymentId);

            expect(address1).toBe(address2);
            expect(address1).toMatch(/^G[A-Z0-9]{55}$/); // Basic Stellar address regex
        });

        it('should derive different addresses for different payment IDs', async () => {
            const merchantId = 'merchant_1';
            const address1 = await service.derivePaymentAddress(merchantId, 'payment_A');
            const address2 = await service.derivePaymentAddress(merchantId, 'payment_B');

            expect(address1).not.toBe(address2);
        });

        it('should derive different addresses for different merchant IDs', async () => {
            const paymentId = 'payment_A';
            const address1 = await service.derivePaymentAddress('merchant_1', paymentId);
            const address2 = await service.derivePaymentAddress('merchant_2', paymentId);

            expect(address1).not.toBe(address2);
        });
    });

    describe('regenerateKeypair', () => {
        it('should regenerate the correct keypair', async () => {
            const merchantId = 'merchant_1';
            const paymentId = 'payment_A';

            const { publicKey, secretKey } = await service.regenerateKeypair(merchantId, paymentId);
            const derivedAddress = await service.derivePaymentAddress(merchantId, paymentId);

            expect(publicKey).toBe(derivedAddress);
            expect(secretKey).toMatch(/^S[A-Z0-9]{55}$/); // Basic Stellar secret key regex
        });
    });

    describe('verifyAddress', () => {
        it('should return true for correct address', async () => {
            const merchantId = 'merchant_1';
            const paymentId = 'payment_A';
            const address = await service.derivePaymentAddress(merchantId, paymentId);

            expect(await service.verifyAddress(merchantId, paymentId, address)).toBe(true);
        });

        it('should return false for incorrect address', async () => {
            const merchantId = 'merchant_1';
            const paymentId = 'payment_A';
            const otherAddress = await service.derivePaymentAddress(merchantId, 'payment_B');

            expect(await service.verifyAddress(merchantId, paymentId, otherAddress)).toBe(false);
        });
    });
});
