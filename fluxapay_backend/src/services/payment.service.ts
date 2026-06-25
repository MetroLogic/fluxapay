import { PrismaClient } from "../generated/client/client";
import crypto from "crypto";
import { HDWalletService } from "./HDWalletService";
import { StellarService } from "./StellarService";
import { sorobanQueue } from "./sorobanQueue.service";
import { eventBus, AppEvents } from "./EventService";
import { validateAndSanitizeMetadata } from "../utils/metadata.util";
import { PaymentStatus } from "../types/payment";
import { trackPaymentCreated } from "../middleware/metrics.middleware";
import { FxService } from "./fx.service";
import { DepositAddressService } from "./depositAddress.service";

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

  /** Base URL for hosted checkout (e.g. https://pay.fluxapay.com). Uses PAY_CHECKOUT_BASE or BASE_URL. */
  static getCheckoutBaseUrl(): string {
    const base =
      process.env.PAY_CHECKOUT_BASE ||
      process.env.BASE_URL ||
      "http://localhost:3000";
    return base.replace(/\/$/, "");
  }

  static async createPayment({
    amount,
    currency,
    customer_email,
    merchantId,
    description,
    metadata,
    success_url,
    cancel_url,
    customerId,
  }: {
    amount: number;
    currency: string;
    customer_email: string;
    merchantId: string;
    description?: string;
    metadata?: Record<string, unknown>;
    success_url?: string;
    cancel_url?: string;
    customerId?: string;
  }) {
    const paymentId = crypto.randomUUID();
    const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry
    const sanitizedMetadata = validateAndSanitizeMetadata(metadata);

    // Build absolute checkout URL using PAY_CHECKOUT_BASE env var
    const checkoutBase = PaymentService.getCheckoutBaseUrl();
    const checkout_url = `${checkoutBase}/pay/${paymentId}`;

    // FX conversion
    const fxRate = await FxService.getUSDCExchangeRate(currency);
    const usdcAmount = amount * fxRate;

    // Try to allocate an address from the pool
    let stellarAddress = await DepositAddressService.allocateAddress(paymentId);
    let paymentIndex = null;
    let derivationPath = null;
    let encryptedKeyData = null;

    if (!stellarAddress) {
      // Fallback to deterministic HD derivation if pool is empty
      const hdWalletService = new HDWalletService();
      const derived = await hdWalletService.derivePaymentAddress(
        merchantId,
        paymentId,
      );
      encryptedKeyData = await hdWalletService.encryptKeyData(
        derived.merchantIndex,
        derived.paymentIndex,
      );
      stellarAddress = derived.publicKey;
      paymentIndex = derived.paymentIndex;
      derivationPath = derived.derivationPath;
    }

    // Create payment with the derived Stellar address and derivation metadata
    const payment = await prisma.payment.create({
      data: {
        id: paymentId,
        amount,
        currency,
        usdc_amount: usdcAmount,
        fx_rate: fxRate,
        customer_email,
        description: description ?? null,
        merchantId,
        metadata: sanitizedMetadata as any,
        expiration,
        status: PaymentStatus.PENDING,
        checkout_url,
        success_url: success_url ?? null,
        cancel_url: cancel_url ?? null,
        ...(customerId ? { customerId } : {}),
        stellar_address: stellarAddress,
        // HD wallet derivation fields (null if from pool, as pool handles its own)
        payment_index: paymentIndex,
        derivation_path: derivationPath,
        encrypted_key_data: encryptedKeyData,
      },
    });

    trackPaymentCreated();

    // Prepare the Stellar account asynchronously (fund and add trustline)
    // This runs in the background to avoid blocking payment creation.
    // Contract tests can disable this side effect to avoid post-test async logs.
    if (process.env.DISABLE_STELLAR_PREPARE !== "true") {
      const stellarService = new StellarService();
      stellarService.prepareAccount(merchantId, paymentId).catch((error) => {
        console.error(
          `Failed to prepare Stellar account for payment ${paymentId}:`,
          error,
        );
      });
    }

    return payment;
  }

  /**
   * Verifies a payment on-chain via the Soroban queue, updates the database,
   * and emits an internal event.
   *
   * The on-chain submission is enqueued asynchronously; the DB is updated
   * optimistically so the rest of the payment flow is not blocked.
   */
  static async verifyPayment(
    paymentId: string,
    transactionHash: string,
    payerAddress: string,
    amountReceived: number,
  ): Promise<any> {
    // 1. Update local PostgreSQL database optimistically
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.CONFIRMED,
        transaction_hash: transactionHash,
        payer_address: payerAddress,
        confirmed_at: new Date(),
      },
    });

    // 2. Enqueue the Soroban contract submission (non-blocking)
    sorobanQueue.enqueue(paymentId, transactionHash, String(amountReceived));

    // 3. Emit internal event for Webhook Service to pick up
    eventBus.emit(AppEvents.PAYMENT_CONFIRMED, payment);
    eventBus.emit(AppEvents.PAYMENT_UPDATED, payment);

    return payment;
  }
}
