/**
 * Email Notification Service
 *
 * Handles async email notifications for payment confirmations.
 * Respects merchant notification preferences.
 */

import { eventBus, AppEvents } from './EventService';
import {
  sendPaymentConfirmationEmail,
  PaymentConfirmationDetails,
  sendPartialPaymentEmail,
} from './email.service';
import { PrismaClient } from '../generated/client/client';

import { prisma } from "../config/prisma";

/**
 * Initialize email notification listeners
 */
export function initializeEmailNotifications() {
  // Listen for payment confirmation events
  eventBus.on(AppEvents.PAYMENT_CONFIRMED, handlePaymentConfirmed);
  eventBus.on(AppEvents.PAYMENT_PARTIAL_RECEIVED, handlePartialPaymentReceived);

  console.log('[EmailNotification] Email notification service initialized');
}

async function handlePartialPaymentReceived(payment: any) {
  if (!payment.customer_email) {
    console.warn(`[EmailNotification] No customer email for partial payment ${payment.id}`);
    return;
  }

  try {
    await sendPartialPaymentEmail(
      payment.customer_email,
      payment.merchant?.business_name || "the merchant",
      {
        payment_id: payment.id,
        expected_amount: payment.amount.toString(),
        amount_received: payment.amountReceived.toString(),
        remaining_balance: payment.remainingBalance.toString(),
        currency: payment.currency,
      },
    );
  } catch (error) {
    console.error(
      `[EmailNotification] Failed to send partial payment email for payment ${payment.id}:`,
      error,
    );
  }
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

    // Build explorer link.
    //
    // Network detection keys off the horizon URL, matching payment.controller.ts.
    // Keying off STELLAR_NETWORK_PASSPHRASE cannot work: the real testnet
    // passphrase is "Test SDF Network ; September 2015", which does not contain
    // the substring "Testnet", so that check always resolved to "public" and
    // emailed testnet merchants a mainnet explorer link (#1190).
    const network = (process.env.STELLAR_HORIZON_URL || "").includes("testnet")
      ? "testnet"
      : "public";
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
      // Customer locale from checkout session metadata (Accept-Language is resolved at checkout)
      locale: payment.metadata?.locale || payment.customer_locale || undefined,
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
