// Payment Monitor Oracle
import { Horizon, Asset } from "@stellar/stellar-sdk";
import { PrismaClient } from "../generated/client/client";
import { Decimal } from "@prisma/client/runtime/library";
import { paymentContractService } from "./paymentContract.service";

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

const prisma = new PrismaClient();
const getServer = () => new Horizon.Server(HORIZON_URL());

/**
 * Run one pass of the payment monitor: check for expired payments,
 * fetch all pending or partially paid, check for incoming USDC,
 * and update status. Safe to call repeatedly from a cron job.
 */
export async function runPaymentMonitorTick(): Promise<void> {
  const now = new Date();

  // 1. Check for expired payments (pending or partially_paid)
  await prisma.payment.updateMany({
    where: {
      status: { in: ['pending', 'partially_paid'] },
      expiration: { lte: now },
    },
    data: { status: 'expired' },
  });

  // 2. Monitor active payments
  const payments = await prisma.payment.findMany({
    where: {
      status: { in: ['pending', 'partially_paid'] },
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

      // Determine new status based on total balance
      let newStatus: string | undefined;
      const expectedAmount = Number(payment.amount as any as Decimal);

      if (totalReceived >= expectedAmount) {
        newStatus = totalReceived > expectedAmount ? 'overpaid' : 'confirmed';
      } else if (totalReceived > 0) {
        newStatus = 'partially_paid';
      }

      // Update database if status changed or new activity detected
      if (newStatus && (newStatus !== payment.status || latestTxHash)) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: newStatus as any,
            last_paging_token: latestPagingToken,
            ...(latestTxHash && { transaction_hash: latestTxHash }),
          },
        });

        // Trigger on-chain verification via Soroban contract
        if ((newStatus === 'confirmed' || newStatus === 'overpaid') && latestTxHash) {
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
          data: { last_paging_token: latestPagingToken },
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

