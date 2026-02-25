import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { HDWalletService } from './HDWalletService';
import { StellarService } from './StellarService';

const prisma = new PrismaClient();

export class PaymentService {
  static getRateLimitWindowSeconds() {
    const configuredWindow = Number(process.env.PAYMENT_RATE_LIMIT_WINDOW_SECONDS);
    return Number.isFinite(configuredWindow) && configuredWindow > 0
      ? Math.floor(configuredWindow)
      : 60;
  }

  static async checkRateLimit(merchantId: string) {
    const configuredLimit = Number(process.env.PAYMENT_RATE_LIMIT_PER_MINUTE);
    const maxPaymentsPerMinute =
      Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 5;

    const rateLimitWindowMs = this.getRateLimitWindowSeconds() * 1000;
    const windowStart = new Date(Date.now() - rateLimitWindowMs);
    const count = await prisma.payment.count({
      where: {
        merchantId,
        createdAt: { gte: windowStart },
      },
    });
    return count < maxPaymentsPerMinute;
  }

  static async createPayment({ amount, currency, customer_email, merchantId, metadata }: any) {
    const paymentId = uuidv4();
    const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry
    
    // Derive the Stellar address for this payment using KMS-backed HDWalletService
    const hdWalletService = new HDWalletService();
    const stellarAddress = await hdWalletService.derivePaymentAddress(merchantId, paymentId);
    
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
