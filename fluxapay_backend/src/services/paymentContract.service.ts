import { Keypair, nativeToScVal, rpc, TransactionBuilder, Networks, Contract } from '@stellar/stellar-sdk';
import { isDevEnv } from '../helpers/env.helper';
import { PrismaClient } from '../generated/client/client';
import { recordSorobanFailure, recordSorobanSuccess } from './SorobanService';

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
                const contractTxHash = await this.invokeVerifyContract(paymentId, txHash, amount);

                await prisma.payment.update({
                    where: { id: paymentId },
                    data: {
                        onchain_verified: true,
                        contract_tx_hash: contractTxHash,
                        verification_error: null
                    }
                });

                if (isDevEnv()) {
                    console.log(`Successfully verified payment ${paymentId} on-chain (tx: ${contractTxHash}).`);
                }
                recordSorobanSuccess();
                return true;
            } catch (error) {
                attempt++;
                let errorMessage = 'Unknown error';
                if (error instanceof Error) errorMessage = error.message;

                console.error(`Attempt ${attempt} to verify payment ${paymentId} on-chain failed:`, errorMessage);

                if (attempt >= MAX_RETRIES) {
                    await prisma.payment.update({
                        where: { id: paymentId },
                        data: {
                            verification_error: errorMessage
                        }
                    });
                    recordSorobanFailure(errorMessage);
                    this.logToManualInterventionQueue(paymentId, errorMessage);
                    return false;
                }

                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)));
            }
        }
        return false;
    }

    /**
     * Builds and submits the verify_payment Soroban call.
     * Fee is derived from XDR simulation rather than hardcoded.
     * Returns the confirmed transaction hash.
     */
    private async invokeVerifyContract(paymentId: string, txHash: string, amount: string): Promise<string> {
        const contract = new Contract(this.contractId);
        // USDC has 7 decimals on Stellar. Convert decimal string amount to stroops (integer).
        const stroops = BigInt(Math.round(parseFloat(amount) * 10_000_000));

        const args = [
            nativeToScVal(paymentId, { type: 'string' }),
            nativeToScVal(txHash, { type: 'string' }),
            nativeToScVal(stroops, { type: 'i128' })
        ];

        const sourceAccount = await this.server.getAccount(this.adminKeypair.publicKey());

        // Use a minimal placeholder fee; the real fee is determined by XDR simulation below.
        const tx = new TransactionBuilder(sourceAccount, {
            fee: '100',
            networkPassphrase: this.networkPassphrase,
        })
            .addOperation(contract.call('verify_payment', ...args))
            .setTimeout(30)
            .build();

        // Estimate Soroban resource fees by simulating the transaction and reading the XDR result.
        const simulation = await this.server.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(simulation)) {
            throw new Error(`Soroban XDR fee estimation failed: ${simulation.error}`);
        }

        // assembleTransaction replaces the placeholder fee with the actual resource fee from XDR,
        // and sets the Soroban footprint (ledger keys) and auth entries.
        const preparedTx = rpc.assembleTransaction(tx, simulation).build();
        preparedTx.sign(this.adminKeypair);

        const sendTxResponse = await this.server.sendTransaction(preparedTx);

        if (sendTxResponse.status === 'ERROR') {
            throw new Error(`Transaction submission failed: ${JSON.stringify(sendTxResponse)}`);
        }

        // Poll until confirmed or times out.
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

        return sendTxResponse.hash;
    }

    private logToManualInterventionQueue(paymentId: string, reason: string) {
        console.error(`[MANUAL INTERVENTION REQUIRED] Payment ${paymentId} failed on-chain verification: ${reason}`);
    }
}

export const paymentContractService = new PaymentContractService();
