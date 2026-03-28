import { PrismaClient } from '../generated/client';
import { HDWalletService } from './HDWalletService';
import { Horizon, TransactionBuilder, Operation, Asset, Keypair, Networks } from '@stellar/stellar-sdk';

const prisma = new PrismaClient();
const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
const masterSeed = process.env.HD_WALLET_MASTER_SEED || '';
const treasuryAddress = process.env.TREASURY_ADDRESS || '';

// USDC asset details (assumes testnet or mainnet based on env mapping in production, but we keep it simple here)
const USDC_ASSET_CODE = process.env.USDC_ASSET_CODE || 'USDC';
const USDC_ISSUER = process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWTTCJM4RTCKBLICNOB66DWOUIGRXCGTJHAK';
const usdcAsset = new Asset(USDC_ASSET_CODE, USDC_ISSUER);

const server = new Horizon.Server(horizonUrl);
const hdWalletService = new HDWalletService(masterSeed);

export class SweepService {
    /**
     * Sweeps USDC from derived payment addresses to the treasury.
     * Optionally merges the account to reclaim the XLM reserve.
     */
    public static async sweepPaidPayments() {
        if (!masterSeed || !treasuryAddress) {
            console.error('SweepService: Missing HD_WALLET_MASTER_SEED or TREASURY_ADDRESS in env variables');
            return;
        }

        // Fetch payments that haven't been swept yet and have a generated stellar address
        const pendingSweeps = await prisma.payment.findMany({
            where: {
                swept: false,
                stellar_address: {
                    not: null
                },
                status: {
                    in: ['paid', 'overpaid', 'partially_paid', 'confirmed']
                }
            }
        });

        if (pendingSweeps.length === 0) {
            console.log('SweepService: No pending sweeps found.');
            return;
        }

        console.log(`SweepService: Found ${pendingSweeps.length} pending sweeps. Processing...`);

        for (const payment of pendingSweeps) {
            try {
                await this.sweepPayment(payment);
            } catch (error) {
                console.error(`SweepService: Failed to sweep payment ${payment.id}. Error:`, error);
                // Do not mark as swept on failure
            }
        }
    }

    private static async sweepPayment(payment: any) {
        console.log(`SweepService: Sweeping payment ${payment.id}`);
        
        // Recover the keypair for the derived address
        const { secretKey, publicKey } = hdWalletService.regenerateKeypair(payment.merchantId, payment.id);

        if (publicKey !== payment.stellar_address) {
            throw new Error(`Derived public key ${publicKey} does not match payment stellar address ${payment.stellar_address}`);
        }

        const sourceKeypair = Keypair.fromSecret(secretKey);

        // Fetch account details to get sequence number and balances
        const sourceAccount = await server.loadAccount(publicKey);
        
        // Find USDC balance
        const usdcBalanceObj = sourceAccount.balances.find(
            (b: any) => b.asset_code === USDC_ASSET_CODE && b.asset_issuer === USDC_ISSUER
        );

        const usdcBalance = usdcBalanceObj ? parseFloat(usdcBalanceObj.balance) : 0;

        let txBuilder = new TransactionBuilder(sourceAccount, {
            fee: '100',
            networkPassphrase,
        });

        let hasOperations = false;

        // Operation 1: Payment (Send fully USDC to treasury)
        if (usdcBalance > 0) {
            txBuilder.addOperation(
                Operation.payment({
                    destination: treasuryAddress,
                    asset: usdcAsset,
                    amount: usdcBalance.toString()
                })
            );
        } else {
            console.log(`SweepService: Payment ${payment.id} has 0 USDC balance.`);
        }

        // Operation 2: Remove USDC Trustline
        // Required before Account Merge: An account cannot be merged if it still has active trustlines.
        txBuilder.addOperation(
            Operation.changeTrust({
                asset: usdcAsset,
                limit: '0'
            })
        );

        // Operation 3: Account Merge to reclaim XLM reserve
        txBuilder.addOperation(
            Operation.accountMerge({
                destination: treasuryAddress
            })
        );

        txBuilder.setTimeout(30);
        const transaction = txBuilder.build();
        transaction.sign(sourceKeypair);

        // Submit to Horizon
        const response = await server.submitTransaction(transaction);
        const sweepTxHash = response.hash;

        // Atomic DB Update
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                swept: true,
                swept_at: new Date(),
                sweep_tx_hash: sweepTxHash
            }
        });

        console.log(`SweepService: Successfully swept payment ${payment.id}. Tx Hash: ${sweepTxHash}`);
    }
}
