/**
 * Email Notification Service
 *
 * Handles async email notifications for payment confirmations.
 * Respects merchant notification preferences.
 */

import { eventBus, AppEvents } from './EventService';
import { sendPaymentConfirmationEmail, PaymentConfirmationDetails } from './email.service';
import { PrismaClient } from '../generated/client/client';

const prisma = new PrismaClient();

/**
 * Initialize email notification listeners
 */
export function initializeEmailNotifications() {
  // Listen for payment confirmation events
  eventBus.on(AppEvents.PAYMENT_CONFIRMED, handlePaymentConfirmed);

  console.log('[EmailNotification] Email notification service initialized');
}

/**
 * Handle payment confirmed event
 * Sends async email notification if merchant has enabled it
 */
async function handlePaymentConfirmed(payment: any) {
  try {
    // Fetch merchant with email preferences
    const merchant = await prisma.merchant.findUnique({
      where: { id: payment.merchantId },
      select: {
        email: true,
        business_name: true,
        email_notifications_enabled: true,
        notify_on_payment: true,
      },
    });

    if (!merchant) {
      console.warn(`[EmailNotification] Merchant not found for payment ${payment.id}`);
      return;
    }

    // Check if merchant wants email notifications for payments
    if (!merchant.email_notifications_enabled || !merchant.notify_on_payment) {
      return;
    }

    // Build explorer link
    const network = process.env.STELLAR_NETWORK_PASSPHRASE?.includes('Testnet') ? 'testnet' : 'public';
    const explorerLink = payment.transaction_hash
      ? `https://stellar.expert/explorer/${network}/tx/${payment.transaction_hash}`
      : `https://stellar.expert/explorer/${network}/account/${payment.stellar_address}`;

    // Send email (non-blocking)
    const details: PaymentConfirmationDetails = {
      amount: payment.amount.toString(),
      currency: payment.currency,
      payment_id: payment.id,
      merchant_reference: payment.merchant_reference || undefined,
      explorer_link: explorerLink,
      timestamp: payment.updated_at || payment.created_at,
    };

    await sendPaymentConfirmationEmail(
      merchant.email,
      merchant.business_name,
      details
    );

    console.log(`[EmailNotification] Payment confirmation email sent to ${merchant.email} for payment ${payment.id}`);
  } catch (error) {
    // Log error but don't throw - we don't want to block payment processing
    console.error(`[EmailNotification] Failed to send payment confirmation email for payment ${payment.id}:`, error);
  }
}
