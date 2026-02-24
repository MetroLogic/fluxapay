import { StellarService } from '../StellarService';
import { HDWalletService } from '../HDWalletService';
import { Keypair } from '@stellar/stellar-sdk';

// Mock the entire stellar-sdk
jest.mock('@stellar/stellar-sdk', () => {
    const actual = jest.requireActual('@stellar/stellar-sdk');
    return {
        ...actual,
        Horizon: {
            Server: jest.fn().mockImplementation(() => ({
                loadAccount: jest.fn(),
                submitTransaction: jest.fn()
            }))
        }
    };
});

describe('StellarService', () => {
    let stellarService: StellarService;
    let mockServer: any;

    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            ...originalEnv,
            FUNDER_SECRET_KEY: Keypair.random().secret(),
            HD_WALLET_MASTER_SEED: 'test-seed-123'
        };

        const { Horizon } = require('@stellar/stellar-sdk');
        stellarService = new StellarService();
        mockServer = (stellarService as any).server; // Access private property for mocking
        
        const mockHDWallet = new HDWalletService('test-seed');
        // Override regenerateKeypair to return predictable keys
        mockHDWallet.regenerateKeypair = jest.fn().mockResolvedValue({
            publicKey: 'G_MOCK_PUB',
            secretKey: 'S_MOCK_SEC'
        });
        stellarService.setHDWalletService(mockHDWallet);
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.clearAllMocks();
    });

    describe('checkAccountExists', () => {
        it('should return true if loadAccount succeeds', async () => {
            mockServer.loadAccount.mockResolvedValueOnce({ id: 'test-account' });
            const result = await stellarService.checkAccountExists('some-pub-key');
            expect(result).toBe(true);
            expect(mockServer.loadAccount).toHaveBeenCalledWith('some-pub-key');
        });

        it('should return false if loadAccount throws 404', async () => {
            const error = new Error('Not found') as any;
            error.response = { status: 404 };
            mockServer.loadAccount.mockRejectedValueOnce(error);

            const result = await stellarService.checkAccountExists('some-pub-key');
            expect(result).toBe(false);
        });

        it('should throw if loadAccount throws non-404 error', async () => {
            const error = new Error('Network error') as any;
            error.response = { status: 500 };
            mockServer.loadAccount.mockRejectedValueOnce(error);

            await expect(stellarService.checkAccountExists('some-pub-key')).rejects.toThrow('Network error');
        });
    });

    describe('checkTrustline', () => {
        it('should return true if asset balance exists', async () => {
            mockServer.loadAccount.mockResolvedValueOnce({
                balances: [
                    { asset_type: 'native', balance: '1.0' },
                    { asset_code: 'USDC', asset_issuer: 'ISSUER_KEY', balance: '10.0' }
                ]
            });

            const result = await stellarService.checkTrustline('G_MOCK', 'USDC', 'ISSUER_KEY');
            expect(result).toBe(true);
        });

        it('should return false if asset balance does not exist', async () => {
            mockServer.loadAccount.mockResolvedValueOnce({
                balances: [
                    { asset_type: 'native', balance: '1.0' },
                    { asset_code: 'EURT', asset_issuer: 'ISSUER_KEY', balance: '10.0' }
                ]
            });

            const result = await stellarService.checkTrustline('G_MOCK', 'USDC', 'ISSUER_KEY');
            expect(result).toBe(false);
        });
    });

    describe('prepareAccount flow logic', () => {
        it('should only add trustline if account exists but lacks trustline', async () => {
            // Mock account exists
            jest.spyOn(stellarService, 'checkAccountExists').mockResolvedValue(true);
            // Mock trustline does not exist
            jest.spyOn(stellarService, 'checkTrustline').mockResolvedValue(false);
            
            // Mock addTrustline to resolve
            const addTrustlineSpy = jest.spyOn(stellarService as any, 'addTrustline').mockResolvedValue(true);
            const createAndFundSpy = jest.spyOn(stellarService as any, 'createAndFundAccount');

            await stellarService.prepareAccount('merchant_1', 'payment_1');

            expect(createAndFundSpy).not.toHaveBeenCalled();
            expect(addTrustlineSpy).toHaveBeenCalledWith('S_MOCK_SEC', 'USDC', expect.any(String));
        });

        it('should do nothing if account exists and has trustline', async () => {
            // Mock account exists
            jest.spyOn(stellarService, 'checkAccountExists').mockResolvedValue(true);
            // Mock trustline exists
            jest.spyOn(stellarService, 'checkTrustline').mockResolvedValue(true);
            
            const addTrustlineSpy = jest.spyOn(stellarService as any, 'addTrustline');
            const createAndFundSpy = jest.spyOn(stellarService as any, 'createAndFundAccount');

            await stellarService.prepareAccount('merchant_1', 'payment_1');

            expect(createAndFundSpy).not.toHaveBeenCalled();
            expect(addTrustlineSpy).not.toHaveBeenCalled();
        });

        it('should create, fund, and add trustline if account does not exist', async () => {
            // Mock account does not exist
            jest.spyOn(stellarService, 'checkAccountExists').mockResolvedValue(false);
            // Mock trustline does not exist (it won't on a new account)
            jest.spyOn(stellarService, 'checkTrustline').mockResolvedValue(false);
            
            const createAndFundSpy = jest.spyOn(stellarService as any, 'createAndFundAccount').mockResolvedValue(true);
            const addTrustlineSpy = jest.spyOn(stellarService as any, 'addTrustline').mockResolvedValue(true);

            await stellarService.prepareAccount('merchant_1', 'payment_1');

            expect(createAndFundSpy).toHaveBeenCalledWith('G_MOCK_PUB', '2.0');
            expect(addTrustlineSpy).toHaveBeenCalledWith('S_MOCK_SEC', 'USDC', expect.any(String));
        });
    });
});
