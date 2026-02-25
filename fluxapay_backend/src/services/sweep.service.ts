import { PrismaClient, Payment } from '@prisma/client';
import { HDWalletService } from '../services/hdwallet.service';
import { StellarSdk, TransactionBuilder, Networks, Operation, Asset, Keypair } from 'stellar-sdk';
import { getEnv } from '../helpers/env.helper';

const prisma = new PrismaClient();
const USDC_ASSET = new Asset('USDC', getEnv('USDC_ISSUER'));
const TREASURY_ADDRESS = getEnv('TREASURY_ADDRESS');

export class SweepService {
  static async sweepPayments() {
    // Find eligible payments
    const payments: Payment[] = await prisma.payment.findMany({
      where: {
        status: { in: ['confirmed', 'paid'] },
        swept: false,
        expires_at: { gt: new Date() },
      },
    });

    for (const payment of payments) {
      try {
        // Re-derive private key for payment address
        const keypair = await HDWalletService.deriveKeypair(payment.address_index);
        // Load account
        const server = new StellarSdk.Server(getEnv('STELLAR_HORIZON_URL'));
        const account = await server.loadAccount(payment.payment_address);
        // Get USDC balance
        const usdcBalance = account.balances.find(b => b.asset_code === 'USDC' && b.asset_issuer === getEnv('USDC_ISSUER'))?.balance;
        if (!usdcBalance || parseFloat(usdcBalance) === 0) continue;
        // Build transaction
        const tx = new TransactionBuilder(account, {
          fee: await server.fetchBaseFee(),
          networkPassphrase: Networks[getEnv('STELLAR_NETWORK')],
        })
          .addOperation(Operation.payment({
            destination: TREASURY_ADDRESS,
            asset: USDC_ASSET,
            amount: usdcBalance,
          }))
          .setTimeout(60)
          .build();
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
