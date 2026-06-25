/**
 * paymentSettlement.service.ts
 *
 * Per-payment fiat settlement pipeline.
 *
 * Triggers when a payment is confirmed (PAYMENT_CONFIRMED event).
 * Handles USDC → fiat conversion, fee deduction, payout initiation,
 * retry logic, and webhook emission.
 *
 * Flow:
 *  1. Listen for PAYMENT_CONFIRMED event
 *  2. Fetch merchant + bank account
 *  3. Get FX rate from exchange partner
 *  4. Calculate fees (merchant-specific %)
 *  5. Create settlement record
 *  6. Initiate payout via exchange partner
 *  7. Update payment status to settled
 *  8. Emit payment.settled webhook
 *  9. Retry failed settlements (3x, 5-min intervals)
 */

import { PrismaClient } from "../generated/client/client";
import { Decimal } from "@prisma/client/runtime/library";
import { getExchangePartner, ExchangeQuoteResult, PayoutResult } from "./exchange.service";
import { createAndDeliverWebhook } from "./webhook.service";
import { eventBus, AppEvents } from "./EventService";

const prisma = new PrismaClient();

/** Maximum retry attempts for failed settlements */
const MAX_RETRY_ATTEMPTS = 3;

/** Retry interval in milliseconds (5 minutes) */
const RETRY_INTERVAL_MS = 5 * 60 * 1000;

/** Default fee percentage if merchant config is missing */
const DEFAULT_FEE_PERCENT = 1.5;

// ─── Types ───────────────────────────────────────────────────────────────────

interface SettlementResult {
  success: boolean;
  settlementId?: string;
  paymentId: string;
  merchantId: string;
  error?: string;
  retryCount?: number;
}

interface SettlementDetails {
  gross_usdc: number;
  fee_usdc: number;
  net_usdc: number;
  fx_rate: number;
  net_fiat: number;
  currency: string;
  payout_channel: string;
  exchange_ref?: string;
  transfer_ref?: string;
  [key: string]: number | string | undefined;
}

// ─── Settlement Service ───────────────────────────────────────────────────────

export class PaymentSettlementService {
  private isProcessing = new Map<string, boolean>();

  constructor() {
    // Subscribe to PAYMENT_CONFIRMED events
    eventBus.on(AppEvents.PAYMENT_CONFIRMED, this.handlePaymentConfirmed.bind(this));
  }

  /**
   * Handle PAYMENT_CONFIRMED event - trigger settlement for the payment.
   */
  private async handlePaymentConfirmed(payment: any): Promise<void> {
    const paymentId = payment.id;

    // Prevent duplicate processing
    if (this.isProcessing.get(paymentId)) {
      console.log(`[PaymentSettlement] Payment ${paymentId} is already being processed, skipping.`);
      return;
    }

    this.isProcessing.set(paymentId, true);

    try {
      console.log(`[PaymentSettlement] Processing settlement for payment ${paymentId}`);

      const result = await this.settlePayment(paymentId);

      if (result.success) {
        console.log(`[PaymentSettlement] ✅ Settlement succeeded for payment ${paymentId}`);
      } else {
        console.error(`[PaymentSettlement] ❌ Settlement failed for payment ${paymentId}: ${result.error}`);
        
        // Schedule retry if not exhausted
        if ((result.retryCount || 0) < MAX_RETRY_ATTEMPTS) {
          const retryDelay = RETRY_INTERVAL_MS * Math.pow(2, result.retryCount || 0);
          console.log(`[PaymentSettlement] Scheduling retry ${result.retryCount || 0} + 1 in ${retryDelay}ms`);
          setTimeout(() => this.settlePayment(paymentId, (result.retryCount || 0) + 1), retryDelay);
        } else {
          console.error(`[PaymentSettlement] Max retries exceeded for payment ${paymentId}, alerting required`);
          // TODO: Send alert to admin
        }
      }
    } catch (error) {
      console.error(`[PaymentSettlement] Unexpected error processing payment ${paymentId}:`, error);
    } finally {
      this.isProcessing.delete(paymentId);
    }
  }

  /**
   * Settle a single payment - convert USDC to fiat and initiate payout.
   */
  public async settlePayment(paymentId: string, retryCount = 0): Promise<SettlementResult> {
    try {
      // 1. Fetch payment with merchant and bank account
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          merchant: {
            include: { bankAccount: true },
          },
        },
      });

      if (!payment) {
        return {
          success: false,
          paymentId,
          merchantId: "",
          error: "Payment not found",
          retryCount,
        };
      }

      const merchantId = payment.merchantId;

      // 2. Check if already settled
      if (payment.settled) {
        return {
          success: true,
          paymentId,
          merchantId,
          settlementId: payment.settlementId || undefined,
          retryCount,
        };
      }

      // 3. Guard: bank account must exist
      if (!payment.merchant.bankAccount) {
        return {
          success: false,
          paymentId,
          merchantId,
          error: "No bank account on file",
          retryCount,
        };
      }

      // 4. Get merchant-specific fee percentage
      const feePercent = (payment.merchant as any).settlement_fee_percent
        ? Number((payment.merchant as any).settlement_fee_percent)
        : DEFAULT_FEE_PERCENT;

      // 5. Fetch FX rate from exchange partner
      const partner = getExchangePartner();
      const usdcAmount = Number(payment.amount);
      const targetCurrency = payment.merchant.settlement_currency;

      const quote: ExchangeQuoteResult = await partner.getQuote(usdcAmount, targetCurrency);

      // 6. Calculate settlement details
      const fiatGross = quote.fiat_gross;
      const feeAmount = (fiatGross * feePercent) / 100;
      const netFiat = fiatGross - feeAmount;

      const settlementDetails: SettlementDetails = {
        gross_usdc: usdcAmount,
        fee_usdc: (usdcAmount * feePercent) / 100,
        net_usdc: usdcAmount - (usdcAmount * feePercent) / 100,
        fx_rate: quote.exchange_rate,
        net_fiat: netFiat,
        currency: targetCurrency,
        payout_channel: process.env.EXCHANGE_PARTNER || "mock",
        exchange_ref: quote.quote_ref,
      };

      // 7. Create settlement record
      const settlement = await prisma.settlement.create({
        data: {
          merchantId,
          usdc_amount: new Decimal(settlementDetails.gross_usdc),
          amount: new Decimal(fiatGross),
          currency: targetCurrency,
          fees: new Decimal(feeAmount),
          net_amount: new Decimal(netFiat),
          exchange_partner: settlementDetails.payout_channel,
          exchange_rate: new Decimal(settlementDetails.fx_rate),
          exchange_ref: settlementDetails.exchange_ref,
          payment_ids: [paymentId],
          status: "processing",
          scheduled_date: new Date(),
          breakdown: settlementDetails,
        },
      });

      // 8. Initiate payout via exchange partner
      const payout: PayoutResult = await partner.convertAndPayout(
        usdcAmount,
        targetCurrency,
        {
          account_name: payment.merchant.bankAccount.account_name,
          account_number: payment.merchant.bankAccount.account_number,
          bank_name: payment.merchant.bankAccount.bank_name,
          bank_code: payment.merchant.bankAccount.bank_code || undefined,
          currency: payment.merchant.bankAccount.currency,
          country: payment.merchant.bankAccount.country,
        },
        `PAYSETTLE_${paymentId.slice(-8).toUpperCase()}`,
      );

      // 9. Update settlement with payout details
      await prisma.settlement.update({
        where: { id: settlement.id },
        data: {
          bank_transfer_id: payout.transfer_ref,
          exchange_ref: payout.exchange_ref,
          payout_partner_payload: payout.raw_partner_payload || null,
          status: "completed",
          processed_date: new Date(),
        },
      });

      // 10. Update payment to settled
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          settled: true,
          settled_at: new Date(),
          settlement_ref: payout.transfer_ref,
          settlement_fiat_amount: new Decimal(netFiat),
          settlement_fiat_currency: targetCurrency,
          settlementId: settlement.id,
        },
      });

      // 11. Emit payment.settled webhook
      if (payment.merchant.webhook_url) {
        const webhookPayload = {
          event: "payment.settled",
          payment_id: paymentId,
          merchant_id: merchantId,
          settlement_id: settlement.id,
          settlement: settlementDetails,
          settled_at: new Date().toISOString(),
        };

        createAndDeliverWebhook(merchantId, "payment_settled" as any, webhookPayload).catch((err) => {
          console.error(`[PaymentSettlement] Webhook delivery failed for payment ${paymentId}:`, err);
        });
      }

      return {
        success: true,
        paymentId,
        merchantId,
        settlementId: settlement.id,
        retryCount,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      // Record failed settlement
      try {
        const payment = await prisma.payment.findUnique({
          where: { id: paymentId },
          include: { merchant: true },
        });

        if (payment) {
          await prisma.settlement.create({
            data: {
              merchantId: payment.merchantId,
              usdc_amount: new Decimal(Number(payment.amount)),
              amount: new Decimal(0),
              currency: payment.merchant.settlement_currency,
              fees: new Decimal(0),
              net_amount: new Decimal(0),
              payment_ids: [paymentId],
              status: "failed",
              scheduled_date: new Date(),
              failure_reason: errMsg,
            },
          });

          // Update payment to settlement_failed
          await prisma.payment.update({
            where: { id: paymentId },
            data: {
              settled: false,
              settlement_fiat_amount: null,
              settlement_fiat_currency: null,
            },
          });
        }
      } catch (recordErr) {
        console.error(`[PaymentSettlement] Could not record failure for payment ${paymentId}:`, recordErr);
      }

      return {
        success: false,
        paymentId,
        merchantId: "",
        error: errMsg,
        retryCount,
      };
    }
  }

  /**
   * Get settlement details for a specific payment.
   */
  public async getPaymentSettlement(paymentId: string, merchantId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId, merchantId },
      include: {
        settlement: true,
      },
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    if (!payment.settlement) {
      return {
        payment_id: paymentId,
        settled: payment.settled,
        settlement: null,
      };
    }

    return {
      payment_id: paymentId,
      settled: payment.settled,
      settlement: {
        id: payment.settlement.id,
        gross_usdc: Number(payment.settlement.usdc_amount),
        fee_usdc: Number(payment.settlement.fees),
        net_usdc: Number(payment.settlement.usdc_amount) - Number(payment.settlement.fees),
        fx_rate: Number(payment.settlement.exchange_rate),
        net_fiat: Number(payment.settlement.net_amount),
        currency: payment.settlement.currency,
        payout_channel: payment.settlement.exchange_partner,
        exchange_ref: payment.settlement.exchange_ref,
        transfer_ref: payment.settlement.bank_transfer_id,
        status: payment.settlement.status,
        created_at: payment.settlement.created_at,
        processed_date: payment.settlement.processed_date,
        breakdown: payment.settlement.breakdown,
      },
    };
  }
}

// Export singleton instance
export const paymentSettlementService = new PaymentSettlementService();
