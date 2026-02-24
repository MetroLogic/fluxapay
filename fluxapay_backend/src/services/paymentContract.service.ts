import { Keypair, nativeToScVal, rpc, TransactionBuilder, Networks, Contract, xdr } from '@stellar/stellar-sdk';
import { isDevEnv } from '../helpers/env.helper';
import { PrismaClient } from '../generated/client/client';

const prisma = new PrismaClient();

export class PaymentContractService {
    private rpcUrl: string;
    private networkPassphrase: string;
    private contractId: string;
    private adminKeypair: Keypair;
    private server: rpc.Server;

    constructor() {
        this.rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
        this.networkPassphrase = process.env.SOROBAN_NETWORK_PASSPHRASE || Networks.TESTNET;
        this.contractId = process.env.PAYMENT_CONTRACT_ID || '';

        const adminSecret = process.env.ADMIN_SECRET_KEY;
        if (adminSecret) {
            this.adminKeypair = Keypair.fromSecret(adminSecret);
        } else {
            this.adminKeypair = Keypair.random();
            if (isDevEnv()) {
                console.warn("ADMIN_SECRET_KEY not set. Using random keypair. Contract calls will likely fail.");
            }
        }

        this.server = new rpc.Server(this.rpcUrl);
    }

    /**
     * Verifies a payment on-chain via the Soroban Smart Contract.
     * Includes an automatic retry mechanism for robustness.
     */
    public async verify_payment(paymentId: string, txHash: string, amount: string): Promise<boolean> {
        if (!this.contractId) {
            console.warn("PAYMENT_CONTRACT_ID is not configured. Skipping on-chain verification.");
            return false;
        }

        const MAX_RETRIES = 3;
        let attempt = 0;
        const baseDelay = 1000;

        while (attempt < MAX_RETRIES) {
            try {
                const txResponse = await this.invokeVerifyContract(paymentId, txHash, amount);

                // Update local DB to reflect success
                await prisma.payment.update({
                    where: { id: paymentId },
                    data: {
                        onchain_verified: true,
                        contract_tx_hash: txResponse.hash,
                        verification_error: null
                    }
                });

                if (isDevEnv()) {
                    console.log(`Successfully verified payment ${paymentId} on-chain.`);
                }
                return true;
            } catch (error) {
                attempt++;
                let errorMessage = 'Unknown error';
                if (error instanceof Error) errorMessage = error.message;

                console.error(`Attempt ${attempt} to verify payment ${paymentId} on-chain failed:`, errorMessage);

                if (attempt >= MAX_RETRIES) {
                    // Update DB with error message
                    await prisma.payment.update({
                        where: { id: paymentId },
                        data: {
                            verification_error: errorMessage
                        }
                    });
                    this.logToManualInterventionQueue(paymentId, errorMessage);
                    return false;
                }

                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)));
            }
        }
        return false;
    }

    private async invokeVerifyContract(paymentId: string, txHash: string, amount: string) {
        const contract = new Contract(this.contractId);
        // USDC has 7 decimals on Stellar. We must convert the decimal string amount to stroops (integer).
        const stroops = BigInt(Math.round(parseFloat(amount) * 10_000_000));

        // Prepare arguments: payment_id (string), tx_hash (string), amount (i128)
        const args = [
            nativeToScVal(paymentId, { type: 'string' }),
            nativeToScVal(txHash, { type: 'string' }),
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
            throw new Error(`Transaction submission failed: ${JSON.stringify(sendTxResponse)}`);
        }

        // Wait for the transaction to be processed
        let txResponse = await this.server.getTransaction(sendTxResponse.hash);

        let retries = 0;
        while (txResponse.status === 'NOT_FOUND' && retries < 15) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            txResponse = await this.server.getTransaction(sendTxResponse.hash);
            retries++;
        }

        if (txResponse.status === 'FAILED') {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(txResponse)}`);
        }

        return txResponse;
    }

    private logToManualInterventionQueue(paymentId: string, reason: string) {
        console.error(`[MANUAL INTERVENTION REQUIRED] Payment ${paymentId} failed on-chain verification: ${reason}`);
    }
}

export const paymentContractService = new PaymentContractService();
