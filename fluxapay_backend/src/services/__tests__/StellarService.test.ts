import { StellarService } from '../StellarService';
import { HDWalletService } from '../HDWalletService';
import { Keypair } from '@stellar/stellar-sdk';
import { mapStellarError, StellarErrorCode } from '../../utils/stellarErrors';

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

    describe('getAccountBalance', () => {
        it('should return USDC balance when trustline exists', async () => {
            mockServer.loadAccount.mockResolvedValueOnce({
                balances: [
                    { asset_type: 'native', balance: '1.5' },
                    { asset_code: 'USDC', asset_issuer: process.env.USDC_ISSUER_PUBLIC_KEY ?? 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y', balance: '42.50' },
                ]
            });
            const balance = await stellarService.getAccountBalance('G_MOCK');
            expect(balance).toBe(42.5);
        });

        it('should return 0 when no USDC trustline', async () => {
            mockServer.loadAccount.mockResolvedValueOnce({ balances: [{ asset_type: 'native', balance: '1.0' }] });
            const balance = await stellarService.getAccountBalance('G_MOCK');
            expect(balance).toBe(0);
        });

        it('should return 0 when account does not exist (404)', async () => {
            const err: any = new Error('Not found');
            err.response = { status: 404 };
            mockServer.loadAccount.mockRejectedValueOnce(err);
            const balance = await stellarService.getAccountBalance('G_MISSING');
            expect(balance).toBe(0);
        });
    });

    describe('retryWithBackoff', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.spyOn(Math, 'random').mockReturnValue(0);
            (stellarService as any).MAX_RETRIES = 4;
            (stellarService as any).BASE_DELAY_MS = 100;
        });

        afterEach(() => {
            jest.useRealTimers();
            jest.restoreAllMocks();
        });

        it('should apply exponential backoff between retries and respect the retry limit', async () => {
            const retryableError = new Error('Temporary horizon outage') as any;
            retryableError.response = { status: 503 };

            const operation = jest
                .fn()
                .mockRejectedValueOnce(retryableError)
                .mockRejectedValueOnce(retryableError)
                .mockRejectedValueOnce(retryableError)
                .mockResolvedValue('success');

            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            const promise = (stellarService as any).retryWithBackoff(
                operation,
                'createAndFundAccount',
                { destination: 'G_DEST' }
            );

            await Promise.resolve();
            expect(operation).toHaveBeenCalledTimes(1);
            expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);

            await jest.advanceTimersByTimeAsync(100);
            await Promise.resolve();
            expect(operation).toHaveBeenCalledTimes(2);
            expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);

            await jest.advanceTimersByTimeAsync(200);
            await Promise.resolve();
            expect(operation).toHaveBeenCalledTimes(3);
            expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 400);

            await jest.advanceTimersByTimeAsync(400);
            await Promise.resolve();

            await expect(promise).resolves.toBe('success');
            expect(operation).toHaveBeenCalledTimes(4);
        });

        it('should rethrow the last error after all retries are exhausted', async () => {
            const retryableError = new Error('Persistent outage') as any;
            retryableError.response = { status: 503 };

            const operation = jest.fn().mockRejectedValue(retryableError);
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

            const promise = (stellarService as any).retryWithBackoff(
                operation,
                'createAndFundAccount',
                { destination: 'G_DEST' }
            );

            const assertion = expect(promise).rejects.toThrow(
                'createAndFundAccount failed after 4 attempts: Persistent outage'
            );

            await jest.advanceTimersByTimeAsync(100);
            await Promise.resolve();
            await jest.advanceTimersByTimeAsync(200);
            await Promise.resolve();
            await jest.advanceTimersByTimeAsync(400);
            await Promise.resolve();

            await assertion;
            expect(operation).toHaveBeenCalledTimes(4);
            expect(setTimeoutSpy.mock.calls.map(([, delay]) => delay)).toEqual([100, 200, 400]);
        });
    });

    describe('mapStellarError', () => {
        it('should map insufficient funds error', () => {
            const result = mapStellarError({ response: { data: { extras: { result_codes: { transaction: 'tx_insufficient_funds' } } } } });
            expect(result.code).toBe(StellarErrorCode.INSUFFICIENT_FUNDS);
            expect(result.message).toMatch(/insufficient funds/i);
        });

        it('should map bad auth error', () => {
            const result = mapStellarError({ response: { data: { extras: { result_codes: { transaction: 'tx_bad_auth' } } } } });
            expect(result.code).toBe(StellarErrorCode.BAD_AUTH);
            expect(result.message).toMatch(/authorization/i);
        });

        it('should map tx_failed error', () => {
            const result = mapStellarError({ response: { data: { extras: { result_codes: { transaction: 'tx_failed' } } } } });
            expect(result.code).toBe(StellarErrorCode.TX_FAILED);
            expect(result.message).toMatch(/failed/i);
        });

        it('should map op_underfunded error', () => {
            const result = mapStellarError({ response: { data: { extras: { result_codes: { operations: ['op_underfunded'] } } } } });
            expect(result.code).toBe(StellarErrorCode.OP_UNDERFUNDED);
            expect(result.message).toMatch(/insufficient/i);
        });

        it('should map op_no_trust error', () => {
            const result = mapStellarError({ response: { data: { extras: { result_codes: { operations: ['op_no_trust'] } } } } });
            expect(result.code).toBe(StellarErrorCode.OP_NO_TRUST);
            expect(result.message).toMatch(/trustline/i);
        });

        it('should map tx_too_late error', () => {
            const result = mapStellarError({ response: { data: { extras: { result_codes: { transaction: 'tx_too_late' } } } } });
            expect(result.code).toBe(StellarErrorCode.TX_TOO_LATE);
            expect(result.message).toMatch(/expired/i);
        });

        it('should map tx_bad_seq error', () => {
            const result = mapStellarError({ response: { data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } } } });
            expect(result.code).toBe(StellarErrorCode.TX_BAD_SEQ);
            expect(result.message).toMatch(/sequence/i);
        });

        it('should return a generic message for unknown errors', () => {
            const result = mapStellarError(new Error('something weird'));
            expect(result.code).toBe(StellarErrorCode.UNKNOWN);
            expect(result.message).toMatch(/unable to process/i);
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
            expect(addTrustlineSpy).toHaveBeenCalledWith('S_MOCK_SEC', 'USDC', expect.any(String), expect.any(String));
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

            expect(createAndFundSpy).toHaveBeenCalledWith('G_MOCK_PUB', '2.0', expect.any(String));
            expect(addTrustlineSpy).toHaveBeenCalledWith('S_MOCK_SEC', 'USDC', expect.any(String), expect.any(String));
        });
    });
});
