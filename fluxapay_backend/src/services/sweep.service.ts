import { PrismaClient, Payment } from '@prisma/client';
import { HDWalletService } from './HDWalletService';
import { Server, TransactionBuilder, Networks, Operation, Asset, Keypair, AccountResponse, BalanceLine } from 'stellar-sdk';


const prisma = new PrismaClient();
const USDC_ASSET = new Asset('USDC', process.env.USDC_ISSUER!);
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS!;

export class SweepService {
  static async sweepPayments() {
    // Find eligible payments
    const payments: Payment[] = await prisma.payment.findMany({
      where: {
        status: { in: ['confirmed', 'paid'] },
        swept: false,
        expiration: { gt: new Date() },
      },
    });

    for (const payment of payments) {
      try {
        // Re-derive private key for payment address
        const hdWalletService = new HDWalletService();
        const { secretKey } = await hdWalletService.regenerateKeypair(payment.merchantId, payment.id);
        const keypair = Keypair.fromSecret(secretKey);
        // Load account
        const server = new Server(process.env.STELLAR_HORIZON_URL!);
        const account = await server.loadAccount(payment.stellar_address!);
        // Get USDC balance
        const usdcBalance = (account.balances as BalanceLine[]).find((b: any) => b.asset_code === 'USDC' && b.asset_issuer === process.env.USDC_ISSUER)?.balance;
        if (!usdcBalance || parseFloat(usdcBalance) === 0) continue;
        // Build transaction: sweep USDC
        const txBuilder = new TransactionBuilder(account, {
          fee: await server.fetchBaseFee(),
          networkPassphrase: Networks[process.env.STELLAR_NETWORK!],
        })
          .addOperation(Operation.payment({
            destination: TREASURY_ADDRESS,
            asset: USDC_ASSET,
            amount: usdcBalance,
          }));

        // Optional: Account Merge to reclaim XLM reserve
        const FUNDING_ADDRESS = process.env.FUNDING_ADDRESS;
        if (process.env.ENABLE_ACCOUNT_MERGE === 'true' && FUNDING_ADDRESS) {
          txBuilder.addOperation(Operation.accountMerge({
            destination: FUNDING_ADDRESS,
          }));
        }

        const tx = txBuilder.setTimeout(60).build();
        tx.sign(keypair);
        // Submit transaction
        const result = await server.submitTransaction(tx);
        // Update payment record
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            swept: true,
            swept_at: new Date(),
            sweep_tx_hash: result.hash,
          },
        });
      } catch (err) {
        // Log error, continue with next payment
        console.error(`Sweep failed for payment ${payment.id}:`, err);
      }
    }
  }
}
