import { Keypair, nativeToScVal, rpc, TransactionBuilder, Networks, Contract, xdr } from '@stellar/stellar-sdk';
import { isDevEnv } from '../helpers/env.helper';

export class SorobanService {
    private rpcUrl: string;
    private networkPassphrase: string;
    private paymentContractId: string;
    private adminKeypair: Keypair;
    private server: rpc.Server;

    constructor() {
        this.rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
        this.networkPassphrase = process.env.SOROBAN_NETWORK_PASSPHRASE || Networks.TESTNET;
        this.paymentContractId = process.env.PAYMENT_CONTRACT_ID || '';

        const adminSecret = process.env.ADMIN_SECRET_KEY;
        if (adminSecret) {
            this.adminKeypair = Keypair.fromSecret(adminSecret);
        } else {
            this.adminKeypair = Keypair.random();
            if (isDevEnv()) {
                console.warn("ADMIN_SECRET_KEY not set. Using random keypair for SorobanService.");
            }
        }

        this.server = new rpc.Server(this.rpcUrl);
    }

    /**
     * Verifies a payment on the Soroban smart contract.
     */
    public async verifyPaymentOnChain(
        paymentId: string,
        transactionHash: string,
        payerAddress: string,
        amount: number
    ): Promise<boolean> {
        if (!this.paymentContractId) {
            console.warn("PAYMENT_CONTRACT_ID is not configured. Skipping on-chain verification.");
            return false;
        }

        try {
            const contract = new Contract(this.paymentContractId);

            // Convert amount to stroops (7 decimal places) and then to BigInt for i128
            const stroops = BigInt(Math.round(amount * 10_000_000));

            const args = [
                nativeToScVal(paymentId, { type: 'string' }),
                nativeToScVal(transactionHash, { type: 'string' }),
                nativeToScVal(payerAddress, { type: 'address' }),
                nativeToScVal(stroops, { type: 'i128' })
            ];

            const sourceAccount = await this.server.getAccount(this.adminKeypair.publicKey());

            const builder = new TransactionBuilder(sourceAccount, {
                fee: '100000',
                networkPassphrase: this.networkPassphrase,
            });

            const tx = builder
                .addOperation(contract.call('verify_payment', ...args))
                .setTimeout(30)
                .build();

            const preparedTx = await this.server.prepareTransaction(tx) as any;
            preparedTx.sign(this.adminKeypair);

            const sendTxResponse = await this.server.sendTransaction(preparedTx);

            if (sendTxResponse.status === 'ERROR') {
                console.error(`Soroban verification failed to submit: ${JSON.stringify(sendTxResponse)}`);
                return false;
            }

            // Poll for result
            let txResponse = await this.server.getTransaction(sendTxResponse.hash);
            let retries = 0;
            while (txResponse.status === 'NOT_FOUND' && retries < 10) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                txResponse = await this.server.getTransaction(sendTxResponse.hash);
                retries++;
            }

            if (txResponse.status === 'SUCCESS') {
                console.log(`Successfully verified payment ${paymentId} on-chain.`);
                return true;
            } else {
                console.error(`Soroban verification transaction failed: ${JSON.stringify(txResponse)}`);
                return false;
            }

        } catch (error) {
            console.error(`Error verifying payment ${paymentId} on Soroban:`, error);
            return false;
        }
    }
}

export const sorobanService = new SorobanService();
