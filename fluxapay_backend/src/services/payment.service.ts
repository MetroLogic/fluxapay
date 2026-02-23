import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { HDWalletService } from './HDWalletService';
import { StellarService } from './StellarService';

const prisma = new PrismaClient();

export class PaymentService {
  static async checkRateLimit(merchantId: string) {
    // Example: allow max 5 payments per minute
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const count = await prisma.payment.count({
      where: {
        merchantId,
        createdAt: { gte: oneMinuteAgo },
      },
    });
    return count < 5;
  }

  static async createPayment({ amount, currency, customer_email, merchantId, metadata }: any) {
    const paymentId = uuidv4();
    const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry
    
    // Derive the Stellar address for this payment
    const masterSeed = process.env.HD_WALLET_MASTER_SEED;
    if (!masterSeed) {
      throw new Error('HD_WALLET_MASTER_SEED is not configured');
    }
    
    const hdWalletService = new HDWalletService(masterSeed);
    const stellarAddress = hdWalletService.derivePaymentAddress(merchantId, paymentId);
    
    // Create payment with the derived Stellar address
    const payment = await prisma.payment.create({
      data: {
        id: paymentId,
        amount,
        currency,
        customer_email,
        merchantId,
        metadata,
        expiration,
        status: 'pending',
        checkout_url: `/checkout/${uuidv4()}`,
        stellar_address: stellarAddress,
      },
    });
    
    // Prepare the Stellar account asynchronously (fund and add trustline)
    // This runs in the background to avoid blocking payment creation
    const stellarService = new StellarService();
    stellarService.prepareAccount(merchantId, paymentId).catch((error) => {
      console.error(`Failed to prepare Stellar account for payment ${paymentId}:`, error);
    });
    
    return payment;
  }
}
