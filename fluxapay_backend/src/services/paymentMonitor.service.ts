// Payment Monitor Oracle
import { Horizon, Asset } from "@stellar/stellar-sdk";
import { PrismaClient } from "../generated/client/client";
import { Decimal } from "@prisma/client/runtime/library";
import { paymentContractService } from "./paymentContract.service";
import { PaymentStatus } from "../types/payment";

/**
 * paymentMonitor.service.ts
 *
 * Automated on-chain payment detection: polls Stellar Horizon for incoming
 * USDC payments to payment addresses and updates Payment status (confirmed / overpaid / partially_paid).
 * Intended to be run on a schedule via cron.service (e.g. every 1–2 minutes).
 */

const HORIZON_URL = () => process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const USDC_ISSUER = () => process.env.USDC_ISSUER_PUBLIC_KEY || 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y';
const getUsdcAsset = () => new Asset('USDC', USDC_ISSUER());

// Policy configuration
const UNDERPAYMENT_THRESHOLD = parseFloat(process.env.UNDERPAYMENT_ACCEPT_THRESHOLD || '0.1');
const PARTIAL_PAYMENT_TIMEOUT = parseInt(process.env.PARTIAL_PAYMENT_TIMEOUT_MS || '3600000', 10);
const STALE_PAYMENT_TIMEOUT = parseInt(process.env.STALE_PAYMENT_TIMEOUT_MS || '1800000', 10);
const ACCEPT_OVERPAYMENTS = process.env.ACCEPT_OVERPAYMENTS !== 'false';

const prisma = new PrismaClient();
const getServer = () => new Horizon.Server(HORIZON_URL());

/**
 * Run one pass of the payment monitor: check for expired payments,
 * fetch all pending or partially paid, check for incoming USDC,
 * and update status. Safe to call repeatedly from a cron job.
 */
export async function runPaymentMonitorTick(): Promise<void> {
  const now = new Date();
  const partialPaymentExpiry = new Date(now.getTime() - PARTIAL_PAYMENT_TIMEOUT);
  const stalePaymentExpiry = new Date(now.getTime() - STALE_PAYMENT_TIMEOUT);

  // 1. Check for expired payments by expiration date
  await prisma.payment.updateMany({
    where: {
      status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIALLY_PAID] },
      expiration: { lte: now },
    },
    data: { status: PaymentStatus.EXPIRED },
  });

  // 2. Check for partial payments that have timed out
  await prisma.payment.updateMany({
    where: {
      status: PaymentStatus.PARTIALLY_PAID,
      last_seen_at: { lte: partialPaymentExpiry },
    },
    data: { status: PaymentStatus.EXPIRED },
  });

  // 3. Check for stale payments (no recent activity)
  await prisma.payment.updateMany({
    where: {
      status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIALLY_PAID] },
      last_seen_at: { lte: stalePaymentExpiry },
      expiration: { gt: now }, // Not already expired by date
    },
    data: { status: PaymentStatus.EXPIRED },
  });

  // 2. Monitor active payments
  const payments = await prisma.payment.findMany({
    where: {
      status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIALLY_PAID] },
      expiration: { gt: now },
      stellar_address: { not: null },
    },
  });

  for (const payment of payments) {
    const address = payment.stellar_address;
    if (!address) continue;

    try {
      // Fetch total USDC balance for cumulative payment handling
      const account = await getServer().loadAccount(address);
      const usdcBalanceRecord = account.balances.find((b: any) =>
        'asset_code' in b && b.asset_code === 'USDC' && b.asset_issuer === getUsdcAsset().issuer
      );
      const totalReceived = usdcBalanceRecord ? parseFloat(usdcBalanceRecord.balance) : 0;

      // Build the payments query with cursor support to find new transactions
      let paymentsQuery = getServer().payments()
        .forAccount(address)
        .order('desc')
        .limit(10);

      // If we have a last paging token, start from there to only get new transactions
      if (payment.last_paging_token) {
        paymentsQuery = paymentsQuery.cursor(payment.last_paging_token);
      }

      const transactions = await paymentsQuery.call();

      // Track the latest paging token to avoid re-processing
      let latestPagingToken = payment.last_paging_token;

      // Process new transactions (if any) to find the latest valid payment
      let latestTxHash: string | undefined;
      let latestPayer: string | undefined;

      for (const record of transactions.records) {
        if (record.paging_token && (!latestPagingToken || record.paging_token > latestPagingToken)) {
          latestPagingToken = record.paging_token;
        }

        if (record.type === 'payment' &&
          record.asset_type === 'credit_alphanum4' &&
          record.asset_code === 'USDC' &&
          record.asset_issuer === getUsdcAsset().issuer) {

          if (!latestTxHash) {
            latestTxHash = record.transaction_hash;
            latestPayer = record.from;
          }
        }
      }

      // Determine new status based on total balance and policies
      let newStatus: PaymentStatus | undefined;
      const expectedAmount = Number(payment.amount as any as Decimal);
      const underpaymentThreshold = expectedAmount * UNDERPAYMENT_THRESHOLD;

      if (totalReceived >= expectedAmount) {
        // Full payment or overpayment
        if (totalReceived > expectedAmount && ACCEPT_OVERPAYMENTS) {
          newStatus = PaymentStatus.OVERPAID;
        } else if (totalReceived > expectedAmount && !ACCEPT_OVERPAYMENTS) {
          // Treat overpayment as confirmed if overpayments not accepted
          newStatus = PaymentStatus.CONFIRMED;
        } else {
          newStatus = PaymentStatus.CONFIRMED;
        }
      } else if (totalReceived > 0) {
        // Partial payment - check if it meets threshold
        if (totalReceived >= underpaymentThreshold && UNDERPAYMENT_THRESHOLD > 0) {
          newStatus = PaymentStatus.PARTIALLY_PAID;
        } else if (UNDERPAYMENT_THRESHOLD === 0) {
          // No partial payments accepted - keep as pending
          newStatus = undefined;
        } else {
          // Below threshold - keep as pending for now
          newStatus = undefined;
        }
      }

      // Update database if status changed or new activity detected
      if (newStatus && (newStatus !== payment.status || latestTxHash)) {
        const updatedPayment = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: newStatus as any,
            paid_amount: totalReceived,
            last_seen_at: new Date(),
            last_paging_token: latestPagingToken,
            ...(latestTxHash && { transaction_hash: latestTxHash }),
            ...(newStatus === PaymentStatus.CONFIRMED && { confirmed_at: new Date() }),
          },
        });

        // Emit generic status change event
        const { eventBus, AppEvents } = await import('./EventService');
        eventBus.emit(AppEvents.PAYMENT_UPDATED, updatedPayment);

        // Emit specific webhook events for partial and overpayment scenarios
        if (newStatus === PaymentStatus.PARTIALLY_PAID) {
          eventBus.emit(AppEvents.PAYMENT_PARTIALLY_PAID, updatedPayment);
        } else if (newStatus === PaymentStatus.OVERPAID) {
          eventBus.emit(AppEvents.PAYMENT_OVERPAID, updatedPayment);
        }

        // Trigger on-chain verification via Soroban contract
        if ((newStatus === PaymentStatus.CONFIRMED || newStatus === PaymentStatus.OVERPAID) && latestTxHash) {
          // Use the newer paymentContractService with retry logic
          paymentContractService.verify_payment(
            payment.id,
            latestTxHash,
            totalReceived.toString()
          ).catch((err) =>
            console.error(
              `[PaymentMonitor] Failed to initiate on-chain verification for payment ${payment.id}:`,
              err
            )
          );

          // Also emit internal event if needed by other services (like Webhook)
          // We can import PaymentService dynamically to avoid circular dependency
          const { PaymentService } = await import('./payment.service');
          const updatedPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
          if (updatedPayment) {
            const { eventBus, AppEvents } = await import('./EventService');
            eventBus.emit(AppEvents.PAYMENT_CONFIRMED, updatedPayment);
          }
        }
      } else if (latestPagingToken && latestPagingToken !== payment.last_paging_token) {
        // Just update paging token if no status change
        await prisma.payment.update({
          where: { id: payment.id },
          data: { 
            last_paging_token: latestPagingToken,
            last_seen_at: new Date(),
          },
        });
      }
    } catch (e) {
      // Handle 404 meaning account doesn't exist yet (no payments received)
      if ((e as any).response?.status !== 404) {
        console.error(`[PaymentMonitor] Error checking address ${address}:`, e);
      }
    }
  }
}

let monitorTimer: NodeJS.Timeout | null = null;

/**
 * Starts the payment monitor loop.
 */
export function startPaymentMonitor() {
  const intervalMs = parseInt(process.env.PAYMENT_MONITOR_INTERVAL_MS || '120000', 10);
  console.log(`[PaymentMonitor] Starting payment monitor loop (interval: ${intervalMs}ms)`);

  // Run immediately
  runPaymentMonitorTick().catch(err => console.error('[PaymentMonitor] Immediate tick failed:', err));

  // Run on interval
  monitorTimer = setInterval(() => {
    runPaymentMonitorTick().catch(err => console.error('[PaymentMonitor] Tick failed:', err));
  }, intervalMs);
}

/**
 * Stops the payment monitor loop.
 */
export function stopPaymentMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    console.log('[PaymentMonitor] Payment monitor loop stopped.');
  }
}

