jest.mock('@stellar/stellar-sdk', () => {
    const actual = jest.requireActual('@stellar/stellar-sdk');

    return {
        ...actual,
        Horizon: {
            Server: jest.fn().mockImplementation(() => ({
                loadAccount: jest.fn().mockResolvedValue(
                    new actual.Account(actual.Keypair.random().publicKey(), '123'),
                ),
            })),
        },
        rpc: {
            ...actual.rpc,
            Server: jest.fn().mockImplementation(() => ({
                simulateTransaction: jest.fn().mockRejectedValue(new Error('stop after building args')),
            })),
        },
        Contract: jest.fn().mockImplementation((contractId: string) => {
            const contract = new actual.Contract(contractId);
            return { call: jest.fn(contract.call.bind(contract)) };
        }),
    };
});

import { Contract, Keypair, scValToNative, StrKey } from '@stellar/stellar-sdk';
import { SorobanService } from '../SorobanService';

describe('SorobanService', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        process.env.PAYMENT_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 1));
        process.env.SOROBAN_ORACLE_SECRET = Keypair.random().secret();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it.each([
        { amountReceived: 0.1, expectedAmount: 1000000n },
        { amountReceived: 19.99, expectedAmount: 199900000n },
        { amountReceived: 100.5, expectedAmount: 1005000000n },
    ])('encodes $amountReceived as an exact i128 amount', async ({ amountReceived, expectedAmount }) => {
        const service = new SorobanService();

        await expect(service.verifyPaymentOnChain(
            'payment-1',
            'stellar-tx-hash',
            'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
            amountReceived,
        )).rejects.toThrow('stop after building args');

        const contractMock = Contract as unknown as jest.Mock;
        const contractCall = contractMock.mock.results[contractMock.mock.results.length - 1].value.call;
        const [, , , , amountScVal] = contractCall.mock.calls[0];

        expect(scValToNative(amountScVal)).toBe(expectedAmount);
    });
});