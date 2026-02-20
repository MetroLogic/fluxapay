import { Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';

export const createPayment = async (req: Request, res: Response) => {
  try {
    const { amount, currency, customer_email, metadata } = req.body;
    // Type assertion to fix TS error: Property 'user' does not exist on type 'Request'
    const merchantId = (req as any).user.id; // assuming auth middleware sets req.user

    // Rate limit check
    const allowed = await PaymentService.checkRateLimit(merchantId);
    if (!allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    // Create payment
    const payment = await PaymentService.createPayment({
      amount,
      currency,
      customer_email,
      merchantId,
      metadata,
    });

    return res.status(201).json({
      payment_id: payment.id,
      checkout_url: payment.checkout_url,
      expiration: payment.expiration,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      customer_email: payment.customer_email,
      metadata: payment.metadata,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
