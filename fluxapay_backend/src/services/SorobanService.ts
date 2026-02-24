import {
    Horizon,
    TransactionBuilder,
    Networks,
    Keypair,
    Contract,
    scValToNative,
    nativeToScVal,
    Address,
    rpc,
    BASE_FEE
} from '@stellar/stellar-sdk';

export class SorobanService {
    private server: Horizon.Server;
    private rpcServer: rpc.Server;
    private networkPassphrase: string;
    private contractId: string;
    private oracleKeypair: Keypair;

    constructor() {
        const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
        const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
        this.server = new Horizon.Server(horizonUrl);
        this.rpcServer = new rpc.Server(rpcUrl);
        this.networkPassphrase = process.env.SOROBAN_NETWORK_PASSPHRASE || Networks.TESTNET;
        this.contractId = process.env.PAYMENT_CONTRACT_ID || '';

        const oracleSecret = process.env.SOROBAN_ORACLE_SECRET;
        if (!oracleSecret) {
            throw new Error('SOROBAN_ORACLE_SECRET is not defined');
        }
        this.oracleKeypair = Keypair.fromSecret(oracleSecret);
    }

    /**
     * Calls verify_payment on the Soroban contract.
     */
    public async verifyPaymentOnChain(
        paymentId: string,
        transactionHash: string,
        payerAddress: string,
        amountReceived: number
    ): Promise<boolean> {
        if (!this.contractId) {
            throw new Error('PAYMENT_CONTRACT_ID is not defined');
        }

        const contract = new Contract(this.contractId);

        // Prepare arguments for verify_payment(payment_id: String, transaction_hash: String, payer_address: Address, amount_received: i128)
        const args = [
            nativeToScVal(paymentId, { type: 'string' }),
            nativeToScVal(transactionHash, { type: 'string' }),
            nativeToScVal(new Address(payerAddress)),
            nativeToScVal(amountReceived * 10000000, { type: 'i128' }) // Assuming 7 decimals
        ];

        try {
            const oracleAccount = await this.server.loadAccount(this.oracleKeypair.publicKey());

            const txn = new TransactionBuilder(oracleAccount, {
                fee: BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(contract.call('verify_payment', ...args))
                .setTimeout(30)
                .build();

            txn.sign(this.oracleKeypair);

            // 1. Simulation
            const simulation = await this.rpcServer.simulateTransaction(txn);
            if (!rpc.Api.isSimulationSuccess(simulation)) {
                console.error('Soroban simulation failed:', simulation);
                return false;
            }

            // 2. Submission
            const response = await this.rpcServer.sendTransaction(txn);
            if (response.status !== 'PENDING') {
                console.error('Soroban transaction submission failed:', response);
                return false;
            }

            // 3. Polling for transaction status
            let txResult = await this.rpcServer.getTransaction(response.hash);
            let attempts = 0;
            while (txResult.status === 'NOT_FOUND' || txResult.status === 'SUCCESS' && (txResult as any).resultMetaXdr === undefined) {
                if (attempts > 10) break;
                await new Promise(resolve => setTimeout(resolve, 1000));
                txResult = await this.rpcServer.getTransaction(response.hash);
                attempts++;
            }

            if (txResult.status !== 'SUCCESS') {
                console.error('Soroban transaction failed to confirm:', txResult);
                return false;
            }

            // 4. Verify contract state update reflects confirmed
            return await this.verifyContractState(paymentId);
        } catch (error) {
            console.error('Error verifying payment on-chain:', error);
            throw error;
        }
    }

    /**
     * Verifies the contract state for a payment.
     */
    private async verifyContractState(paymentId: string): Promise<boolean> {
        const contract = new Contract(this.contractId);
        const method = 'get_payment_status';
        const args = [nativeToScVal(paymentId, { type: 'string' })];

        try {
            // Using simulation to read state
            const oracleAccount = await this.server.loadAccount(this.oracleKeypair.publicKey());
            const txn = new TransactionBuilder(oracleAccount, {
                fee: BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(contract.call(method, ...args))
                .setTimeout(30)
                .build();

            const simulation = await this.rpcServer.simulateTransaction(txn);
            if (rpc.Api.isSimulationSuccess(simulation) && simulation.result) {
                const status = scValToNative(simulation.result.retval);
                // Return true if status is 'confirmed' (assuming enum or string 'confirmed')
                return status === 'confirmed' || status === 1; // Adjust based on contract's return type
            }
            return false;
        } catch (error) {
            console.error('Error verifying contract state:', error);
            return false;
        }
    }
}
