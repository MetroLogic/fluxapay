import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { HDWalletService } from './HDWalletService';
import { StellarService } from './StellarService';

const prisma = new PrismaClient();

export class PaymentService {
  static async checkRateLimit(merchantId: string) {
    const configuredLimit = Number(process.env.PAYMENT_RATE_LIMIT_PER_MINUTE);
    const maxPaymentsPerMinute =
      Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 5;

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const count = await prisma.payment.count({
      where: {
        merchantId,
        createdAt: { gte: oneMinuteAgo },
      },
    });
    return count < maxPaymentsPerMinute;
  }

  /** Base URL for hosted checkout (e.g. https://pay.fluxapay.com). Uses PAY_CHECKOUT_BASE or BASE_URL. */
  static getCheckoutBaseUrl(): string {
    const base =
      process.env.PAY_CHECKOUT_BASE ||
      process.env.BASE_URL ||
      'http://localhost:3000';
    return base.replace(/\/$/, '');
  }

  static async createPayment({
    amount,
    currency,
    customer_email,
    merchantId,
    metadata,
    success_url,
    cancel_url,
  }: {
    amount: number;
    currency: string;
    customer_email: string;
    merchantId: string;
    metadata?: Record<string, unknown>;
    success_url?: string;
    cancel_url?: string;
  }) {
    const paymentId = uuidv4();
    const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry
    const checkoutBase = PaymentService.getCheckoutBaseUrl();
    const checkout_url = `${checkoutBase}/pay/${paymentId}`;

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
        metadata: metadata ?? {},
        expiration,
        status: 'pending',
        checkout_url,
        success_url: success_url ?? null,
        cancel_url: cancel_url ?? null,
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
