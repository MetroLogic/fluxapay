import { PrismaClient } from '../generated/client/client';
import { v4 as uuidv4 } from 'uuid';
import { createAndDeliverWebhook, generateMerchantPayload } from './webhook.service';

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
    const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry
    const payment = await prisma.payment.create({
      data: {
        id: uuidv4(),
        amount,
        currency,
        customer_email,
        merchantId,
        metadata,
        expiration,
        status: 'pending',
        checkout_url: `/checkout/${uuidv4()}`,
      },
    });
    return payment;
  }

  static async confirmPayment(paymentId: string, txnHash: string, payerAddress: string) {
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'confirmed',
        transaction_hash: txnHash,
        payer_address: payerAddress,
        confirmed_at: new Date(),
      },
      include: {
        merchant: true,
      },
    });

    if (payment.merchant?.webhook_url) {
      const payload = generateMerchantPayload(payment);
      await createAndDeliverWebhook(
        payment.merchantId,
        'payment_confirmed' as any,
        payment.merchant.webhook_url,
        payload,
        payment.id
      );
    }

    return payment;
  }
}
