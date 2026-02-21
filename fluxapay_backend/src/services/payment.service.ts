import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

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
}
