import { PrismaClient, Payment, Merchant } from '../generated/client';
import crypto from 'crypto';

export class WebhookDispatcher {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  public async sendPaymentWebhook(payment: Payment, merchant: Merchant): Promise<void> {
    if (!merchant.webhook_url) {
      console.log(`[WebhookDispatcher] No webhook_url configured for merchant ${merchant.id}. Skipping.`);
      return;
    }

    const payload = JSON.stringify({
      event: 'payment.confirmed',
      data: {
        payment_id: payment.id,
        order_id: payment.order_id,
        amount: payment.amount.toString(),
        currency: payment.currency,
        status: 'CONFIRMED',
        transaction_hash: payment.transaction_hash,
      }
    });

    const secret = process.env.WEBHOOK_SECRET || merchant.webhook_secret || '';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    let deliveryStatus: 'SUCCESS' | 'FAILED' = 'FAILED';

    try {
      const response = await fetch(merchant.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature
        },
        body: payload,
      });

      if (response.ok) {
        deliveryStatus = 'SUCCESS';
        console.log(`[WebhookDispatcher] Webhook delivered successfully for payment ${payment.id}`);
      } else {
        console.error(`[WebhookDispatcher] Webhook failed with HTTP ${response.status} for payment ${payment.id}`);
      }
    } catch (error: any) {
      console.error(`[WebhookDispatcher] Webhook delivery error for payment ${payment.id}:`, error.message);
    } finally {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          webhook_status: deliveryStatus,
          webhook_retries: { increment: 1 }
        }
      });
    }
  }
}
