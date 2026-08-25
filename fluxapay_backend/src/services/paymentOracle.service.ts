/**
 * Payment Oracle Service
 * 
 * Background service that polls the Stellar Horizon API to verify incoming payments.
 * Implements robust error handling, missed block detection, and smart contract verification.
 * 
 * Features:
 * - Configurable polling interval
 * - Amount and asset code verification
 * - Smart contract integration for payment verification
 * - Comprehensive error logging and alerting
 * - Missed block/timeout detection
 * - Graceful degradation and recovery
 */

import { Horizon, Asset } from "@stellar/stellar-sdk";
import type { Horizon as HorizonNamespace } from "@stellar/stellar-sdk";
import { PrismaClient, Payment, PaymentStatus } from "../generated/client/client";
import { prisma } from "../config/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { paymentContractService } from "./paymentContract.service";
import { getLogger, getMetricsCollector } from "../utils/logger";
import { createAndDeliverWebhook } from "./webhook.service";
import { markInvoicePaidForPaymentService } from "./invoice.service";
import { analyzeDuplicatePayments, MatchedStellarPayment } from "../utils/duplicatePayment.util";
import {parseHorizonMemo, resolveMemoMatchMode, validateMemoMatch } from "../utils/oracleMemo.util";
import { isSorobanVerificationEnabled } from "../utils/sorobanVerification.util";
import { getSorobanHealthStatus } from "./SorobanService";
import { redisClient } from "../middleware/redisIdempotency.middleware";
import {
  horizonPoller,
  HORIZON_POLLER_EVENTS,
  HorizonPaymentDetectedEvent,
} from "./horizonPoller.service";

const logger = getLogger("PaymentOracleService");
const metrics = getMetricsCollector();

// ─── Configuration ───────────────────────────────────────────────────────────

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
const USDC_ISSUER = process.env.USDC_ISSUER_PUBLIC_KEY || "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
const POLLING_INTERVAL_MS = parseInt(process.env.ORACLE_POLLING_INTERVAL_MS || "30000", 10); // 30 seconds default
const MAX_MISSED_POLLS = parseInt(process.env.ORACLE_MAX_MISSED_POLLS || "5", 10);
const ENABLE_SMART_CONTRACT_VERIFICATION = isSorobanVerificationEnabled();
const SHARED_DEPOSIT_ADDRESS = process.env.SHARED_DEPOSIT_ADDRESS;
const ENABLE_ADDRESS_POOL = process.env.ENABLE_ADDRESS_POOL === "true";
const BATCH_SIZE = parseInt(process.env.ORACLE_BATCH_SIZE || "50", 10);
const HORIZON_TIMEOUT_MS = parseInt(process.env.ORACLE_HORIZON_TIMEOUT_MS || "10000", 10);
const ORACLE_PENDING_CURSOR_KEY = "oracle:pending_payments_cursor";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaymentVerification {
  paymentId: string;
  address: string;
  expectedAmount: Decimal;
  actualAmount: Decimal;
  assetCode: string;
  assetIssuer: string;
  transactionHash?: string;
  payer?: string;
  verified: boolean;
  status: string;
  matchedPayments: MatchedStellarPayment[];
  hasDuplicatePayment: boolean;
  surplusAmount: Decimal;
}

interface OracleMetrics {
  pollsCompleted: number;
  pollsFailed: number;
  paymentsVerified: number;
  paymentsPartial: number;
  paymentsOverpaid: number;
  paymentsFailed: number;
  missedPolls: number;
  lastPollTimestamp: Date;
  averagePollDurationMs: number;
}

interface HorizonHealthCheck {
  isHealthy: boolean;
  latencyMs: number;
  lastSuccessfulPoll: Date | null;
  consecutiveFailures: number;
}

// ─── Oracle State Management ─────────────────────────────────────────────────

class OracleState {
  private server: Horizon.Server;
  private usdcAsset: Asset;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private metrics: OracleMetrics;
  private healthCheck: HorizonHealthCheck;
  private lastPollTime: Date | null = null;

  constructor() {
    this.server = new Horizon.Server(HORIZON_URL);
    this.usdcAsset = new Asset("USDC", USDC_ISSUER);
    this.metrics = {
      pollsCompleted: 0,
      pollsFailed: 0,
      paymentsVerified: 0,
      paymentsPartial: 0,
      paymentsOverpaid: 0,
      paymentsFailed: 0,
      missedPolls: 0,
      lastPollTimestamp: new Date(),
      averagePollDurationMs: 0,
    };
    this.healthCheck = {
      isHealthy: true,
      latencyMs: 0,
      lastSuccessfulPoll: null,
      consecutiveFailures: 0,
    };
  }

  getServer(): Horizon.Server {
    return this.server;
  }

  getUsdcAsset(): Asset {
    return this.usdcAsset;
  }

  isOracleRunning(): boolean {
    return this.isRunning;
  }

  setRunning(running: boolean): void {
    this.isRunning = running;
  }

  setPollInterval(interval: NodeJS.Timeout | null): void {
    this.pollInterval = interval;
  }

  getPollInterval(): NodeJS.Timeout | null {
    return this.pollInterval;
  }

  updateMetrics(update: Partial<OracleMetrics>): void {
    this.metrics = { ...this.metrics, ...update };
  }

  getMetrics(): OracleMetrics {
    return { ...this.metrics };
  }

  updateHealthCheck(update: Partial<HorizonHealthCheck>): void {
    this.healthCheck = { ...this.healthCheck, ...update };
  }

  getHealthCheck(): HorizonHealthCheck {
    return { ...this.healthCheck };
  }

  setLastPollTime(time: Date): void {
    this.lastPollTime = time;
  }

  getLastPollTime(): Date | null {
    return this.lastPollTime;
  }
}

const oracleState = new OracleState();

// ─── Core Oracle Functions ───────────────────────────────────────────────────

/**
 * Verifies a single payment by checking Horizon for incoming transactions
 */
async function verifyPayment(payment: Payment): Promise<PaymentVerification> {
  const address = payment.stellar_address;
  if (!address) {
    throw new Error(`Payment ${payment.id} has no stellar_address`);
  }

  const expectedAmount = payment.amount;
  const server = oracleState.getServer();
  const usdcAsset = oracleState.getUsdcAsset();

  try {
    // Check account balance for USDC
    const account = await server.loadAccount(address);
    const usdcBalance = account.balances.find(
      (b: any) =>
        "asset_code" in b &&
        b.asset_code === "USDC" &&
        b.asset_issuer === usdcAsset.issuer
    );

    // Build payments query with cursor support
    let paymentsQuery = server
      .payments()
      .forAccount(address)
      .order("desc")
      .limit(10);

    if (payment.last_paging_token) {
      paymentsQuery = paymentsQuery.cursor(payment.last_paging_token);
    }

    const transactions = await paymentsQuery.call();
    let latestPagingToken = payment.last_paging_token;
    const matchedPayments: MatchedStellarPayment[] = [];
    let latestTxHash: string | undefined;
    let latestPayer: string | undefined;

    // Collect all valid USDC payments to this address (not just the first)
    const memoMatchMode = resolveMemoMatchMode(address, {
      sharedDepositAddress: SHARED_DEPOSIT_ADDRESS,
      addressPoolEnabled: ENABLE_ADDRESS_POOL,
    });

    // Process transactions to find valid USDC payments
    for (const record of transactions.records) {
      if (record.paging_token) {
        latestPagingToken = record.paging_token;
      }

      if (record.type === "payment" || record.type === "create_account") {
        const paymentRecord = record as any;

        if (
          paymentRecord.asset_type !== "native" &&
          paymentRecord.asset_code === "USDC" &&
          paymentRecord.asset_issuer === usdcAsset.issuer &&
          paymentRecord.to === address
        ) {
          matchedPayments.push({
            transactionHash: paymentRecord.transaction_hash,
            amount: new Decimal(paymentRecord.amount),
            payer: paymentRecord.from,
            pagingToken: record.paging_token,
          });
          const txHash = paymentRecord.transaction_hash as string | undefined;
          if (!txHash) {
            continue;
          }

          let memoResult;
          try {
            const tx = await server.transactions().transaction(txHash).call();
            const memo = parseHorizonMemo({
              memo_type: tx.memo_type,
              memo: tx.memo,
            });
            memoResult = validateMemoMatch(payment.id, memo, memoMatchMode);
          } catch (memoError: any) {
            logger.warn("Failed to fetch transaction memo for payment attribution", {
              paymentId: payment.id,
              transactionHash: txHash,
              error: memoError.message,
            });
            if (memoMatchMode === "required") {
              continue;
            }
            memoResult = validateMemoMatch(
              payment.id,
              { type: "none" },
              memoMatchMode,
            );
          }

          if (memoResult.rejected) {
            logger.warn("Payment memo mismatch — skipping transaction", {
              paymentId: payment.id,
              expectedMemo: memoResult.expected,
              receivedMemo: memoResult.received,
              transactionHash: txHash,
            });
            continue;
          }

          if (memoMatchMode === "secondary" && !memoResult.matched && memoResult.received) {
            logger.warn("Payment memo secondary verification failed", {
              paymentId: payment.id,
              expectedMemo: memoResult.expected,
              receivedMemo: memoResult.received,
              transactionHash: txHash,
            });
          }

          latestTxHash = txHash;
          latestPayer = paymentRecord.from;
          break;
        }
      }
    }

    // Persist all matched transactions for reconciliation
    for (const matched of matchedPayments) {
      await prisma.paymentReceivedTransaction.upsert({
        where: {
          paymentId_transaction_hash: {
            paymentId: payment.id,
            transaction_hash: matched.transactionHash,
          },
        },
        create: {
          paymentId: payment.id,
          transaction_hash: matched.transactionHash,
          amount: matched.amount,
          payer_address: matched.payer,
        },
        update: {},
      });
    }

    const duplicateAnalysis = analyzeDuplicatePayments(expectedAmount, matchedPayments);
    const latestTx = matchedPayments[0];
    if (!latestTxHash) {
      latestTxHash = latestTx?.transactionHash;
    }
    if (!latestPayer) {
      latestPayer = latestTx?.payer;
    }

    const actualAmount = duplicateAnalysis.totalReceived.gt(0)
      ? duplicateAnalysis.totalReceived
      : usdcBalance
        ? new Decimal(usdcBalance.balance)
        : new Decimal(0);

    // Update paging token
    if (latestPagingToken !== payment.last_paging_token) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { last_paging_token: latestPagingToken },
      });
    }

    // Determine payment status based on amount comparison
    let status = payment.status;
    let verified = false;

    if (actualAmount.gte(expectedAmount)) {
      if (actualAmount.gt(expectedAmount)) {
        status = "overpaid";
      } else {
        status = "confirmed";
      }
      verified = true;
    } else if (actualAmount.gt(0)) {
      status = "partially_paid";
    }

    return {
      paymentId: payment.id,
      address,
      expectedAmount,
      actualAmount,
      assetCode: "USDC",
      assetIssuer: usdcAsset.issuer,
      transactionHash: latestTxHash,
      payer: latestPayer,
      verified,
      status,
      matchedPayments,
      hasDuplicatePayment: duplicateAnalysis.hasDuplicate,
      surplusAmount: duplicateAnalysis.surplusAmount,
    };
  } catch (error: any) {
    logger.error("Payment verification failed", {
      paymentId: payment.id,
      address,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Calls smart contract to verify payment on-chain (if enabled)
 */
async function verifyPaymentOnChain(
  verification: PaymentVerification
): Promise<boolean> {
  if (!ENABLE_SMART_CONTRACT_VERIFICATION) {
    logger.debug("Smart contract verification disabled", {
      paymentId: verification.paymentId,
    });
    return true; // Skip verification if not enabled
  }

  if (!verification.transactionHash) {
    logger.warn("No transaction hash for smart contract verification", {
      paymentId: verification.paymentId,
    });
    return false;
  }

  try {
    const result = await paymentContractService.verify_payment(
      verification.paymentId,
      verification.transactionHash,
      verification.actualAmount.toString()
    );

    logger.info("Smart contract verification completed", {
      paymentId: verification.paymentId,
      verified: result,
    });

    return result;
  } catch (error: any) {
    logger.error("Smart contract verification failed", {
      paymentId: verification.paymentId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Updates payment status in database and triggers webhooks
 */
async function updatePaymentStatus(verification: PaymentVerification): Promise<void> {
  const updateData: any = {
    status: verification.status,
    paid_amount: verification.actualAmount,
  };

  if (verification.transactionHash) {
    updateData.transaction_hash = verification.transactionHash;
  }

  if (verification.payer) {
    updateData.payer_address = verification.payer;
  }

  // Update payment in database
  const updatedPayment = await prisma.payment.update({
    where: { id: verification.paymentId },
    data: updateData,
    include: { merchant: true },
  });

  logger.info("Payment status updated", {
    paymentId: verification.paymentId,
    status: verification.status,
    actualAmount: verification.actualAmount.toString(),
    expectedAmount: verification.expectedAmount.toString(),
  });

  // Trigger webhook for confirmed/overpaid payments
  if (verification.verified && updatedPayment.merchant) {
    try {
      await createAndDeliverWebhook(
        updatedPayment.merchantId,
        "payment_confirmed" as any,
        {
          payment_id: updatedPayment.id,
          amount: updatedPayment.amount.toString(),
          amount_received: verification.actualAmount.toString(),
          currency: updatedPayment.currency,
          status: verification.status,
          transaction_hash: verification.transactionHash,
          payer_address: verification.payer,
        }
      );
    } catch (webhookError: any) {
      logger.error("Webhook delivery failed", {
        paymentId: verification.paymentId,
        error: webhookError.message,
      });
    }

    if (verification.status === "confirmed" || verification.status === "overpaid") {
      await markInvoicePaidForPaymentService(updatedPayment.merchantId, updatedPayment.id);
    }
  }

  // Notify merchant when duplicate Stellar transactions were received
  if (verification.hasDuplicatePayment && updatedPayment.merchant) {
    try {
      await createAndDeliverWebhook(
        updatedPayment.merchantId,
        "payment_duplicate_received" as any,
        {
          payment_id: updatedPayment.id,
          charge_id: updatedPayment.id,
          expected_amount: verification.expectedAmount.toString(),
          total_received: verification.actualAmount.toString(),
          surplus_amount: verification.surplusAmount.toString(),
          transaction_hashes: verification.matchedPayments.map((tx) => tx.transactionHash),
          currency: updatedPayment.currency,
        },
      );
    } catch (webhookError: any) {
      logger.error("Duplicate payment webhook delivery failed", {
        paymentId: verification.paymentId,
        error: webhookError.message,
      });
    }
  }
}

/**
 * Processes a batch of payments for verification
 */
async function processBatch(payments: Payment[]): Promise<void> {
  const results = await Promise.allSettled(
    payments.map(async (payment) => {
      try {
        const verification = await verifyPayment(payment);

        // Perform smart contract verification if payment is confirmed
        if (verification.verified) {
          const onChainVerified = await verifyPaymentOnChain(verification);
          if (!onChainVerified) {
            verification.status = "failed";
            verification.verified = false;
            logger.warn("Smart contract verification failed", {
              paymentId: payment.id,
            });
          }
        }

        // Update payment status
        await updatePaymentStatus(verification);

        // Update metrics
        if (verification.verified) {
          oracleState.updateMetrics({
            paymentsVerified: oracleState.getMetrics().paymentsVerified + 1,
          });
          if (verification.status === "overpaid") {
            oracleState.updateMetrics({
              paymentsOverpaid: oracleState.getMetrics().paymentsOverpaid + 1,
            });
          }
        } else if (verification.status === "partially_paid") {
          oracleState.updateMetrics({
            paymentsPartial: oracleState.getMetrics().paymentsPartial + 1,
          });
        } else if (verification.status === "failed") {
          oracleState.updateMetrics({
            paymentsFailed: oracleState.getMetrics().paymentsFailed + 1,
          });
        }

        metrics.increment("oracle.payment.verified", {
          status: verification.status,
        });
      } catch (error: any) {
        logger.error("Payment processing failed", {
          paymentId: payment.id,
          error: error.message,
        });
        metrics.increment("oracle.payment.error");
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    logger.warn("Some payments failed to process", {
      total: payments.length,
      failed,
    });
  }
}

function activePendingWhere(now: Date) {
  return {
    status: { in: ["pending", "partially_paid"] as PaymentStatus[] },
    expiration: { gt: now },
    stellar_address: { not: null },
  };
}

/**
 * Cursor-paginated fetch of pending payments (max ORACLE_BATCH_SIZE per cycle).
 * Cursor is stored in Redis so subsequent ticks resume where the last left off.
 */
export async function fetchPendingPaymentsPage(now: Date = new Date()): Promise<Payment[]> {
  const baseWhere = activePendingWhere(now);
  let lastCursor: string | null = null;

  try {
    lastCursor = await redisClient.get(ORACLE_PENDING_CURSOR_KEY);
  } catch (error: any) {
    logger.warn("Failed to read oracle pending cursor from Redis", {
      error: error?.message,
    });
  }

  const queryPage = (cursor: string | null) =>
    prisma.payment.findMany({
      where: cursor
        ? { ...baseWhere, id: { gt: cursor } }
        : baseWhere,
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
    });

  let payments = await queryPage(lastCursor);

  // Wrap to the start when the cursor is past the end of the backlog
  if (payments.length === 0 && lastCursor) {
    payments = await queryPage(null);
  }

  try {
    if (payments.length > 0) {
      await redisClient.set(ORACLE_PENDING_CURSOR_KEY, payments[payments.length - 1].id);
    } else {
      await redisClient.del(ORACLE_PENDING_CURSOR_KEY);
    }
  } catch (error: any) {
    logger.warn("Failed to persist oracle pending cursor to Redis", {
      error: error?.message,
    });
  }

  if (payments.length > BATCH_SIZE) {
    throw new Error(
      `Oracle page size ${payments.length} exceeds ORACLE_BATCH_SIZE ${BATCH_SIZE}`,
    );
  }

  return payments;
}

/**
 * Main oracle polling tick - runs on schedule
 */
export async function runOracleTick(): Promise<void> {
  const startTime = Date.now();
  const now = new Date();

  try {
    logger.debug("Oracle tick started", { timestamp: now.toISOString() });

    // Check for missed polls
    const lastPollTime = oracleState.getLastPollTime();
    if (lastPollTime) {
      const timeSinceLastPoll = now.getTime() - lastPollTime.getTime();
      const expectedInterval = POLLING_INTERVAL_MS * 1.5; // Allow 50% tolerance
      
      if (timeSinceLastPoll > expectedInterval) {
        const missedPolls = Math.floor(timeSinceLastPoll / POLLING_INTERVAL_MS) - 1;
        oracleState.updateMetrics({
          missedPolls: oracleState.getMetrics().missedPolls + missedPolls,
        });
        
        logger.warn("Missed oracle polls detected", {
          missedPolls,
          timeSinceLastPoll,
          expectedInterval,
        });
        
        metrics.increment("oracle.missed_polls", { count: missedPolls });
      }
    }

    oracleState.setLastPollTime(now);

    // 1. Mark expired payments
    await prisma.payment.updateMany({
      where: {
        status: { in: ["pending", "partially_paid"] },
        expiration: { lte: now },
      },
      data: { status: "expired" },
    });

    // 2. Emit backlog gauge, then fetch one cursor page of active payments
    const backlog = await prisma.payment.count({
      where: activePendingWhere(now),
    });
    metrics.gauge("oracle_pending_payments_backlog", backlog);

    const payments = await fetchPendingPaymentsPage(now);

    logger.info("Oracle monitoring active payments", {
      count: payments.length,
      batchSize: BATCH_SIZE,
      backlog,
    });

    if (payments.length === 0) {
      logger.debug("No active payments to monitor");
      oracleState.updateMetrics({ pollsCompleted: oracleState.getMetrics().pollsCompleted + 1 });
      return;
    }

    // Register each pending payment's Stellar address with the shared poller so
    // the poller watches them next tick. This ensures Horizon is polled exactly
    // once per address per interval across all consumers.
    for (const payment of payments) {
      if (payment.stellar_address) {
        horizonPoller.watchAddress(payment.stellar_address);
      }
    }

    // 3. Process payments in batch
    await processBatch(payments);

    // 4. Update health check and metrics
    const duration = Date.now() - startTime;
    const currentMetrics = oracleState.getMetrics();
    const avgDuration =
      (currentMetrics.averagePollDurationMs * currentMetrics.pollsCompleted + duration) /
      (currentMetrics.pollsCompleted + 1);

    oracleState.updateMetrics({
      pollsCompleted: currentMetrics.pollsCompleted + 1,
      lastPollTimestamp: now,
      averagePollDurationMs: avgDuration,
    });

    oracleState.updateHealthCheck({
      isHealthy: true,
      latencyMs: duration,
      lastSuccessfulPoll: now,
      consecutiveFailures: 0,
    });

    logger.info("Oracle tick completed", {
      duration,
      paymentsProcessed: payments.length,
    });

    metrics.histogram("oracle.tick.duration", duration);
    metrics.gauge("oracle.active_payments", payments.length);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const currentMetrics = oracleState.getMetrics();
    const healthCheck = oracleState.getHealthCheck();

    oracleState.updateMetrics({
      pollsFailed: currentMetrics.pollsFailed + 1,
    });

    oracleState.updateHealthCheck({
      isHealthy: healthCheck.consecutiveFailures < MAX_MISSED_POLLS - 1,
      consecutiveFailures: healthCheck.consecutiveFailures + 1,
    });

    logger.error("Oracle tick failed", {
      error: error.message,
      stack: error.stack,
      duration,
      consecutiveFailures: healthCheck.consecutiveFailures + 1,
    });

    metrics.increment("oracle.tick.error");

    // Alert if too many consecutive failures
    if (healthCheck.consecutiveFailures + 1 >= MAX_MISSED_POLLS) {
      logger.error("CRITICAL: Oracle health check failed - too many consecutive failures", {
        consecutiveFailures: healthCheck.consecutiveFailures + 1,
        maxAllowed: MAX_MISSED_POLLS,
      });
      metrics.increment("oracle.critical_failure");
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Starts the payment oracle service.
 * Issue #771: Oracle subscribes to the shared HorizonPollerService instead of
 * polling Horizon directly on its own interval. The poller fires exactly once
 * per tick and emits "payment:detected" events that the oracle handles here.
 */
export function startPaymentOracle(): void {
  if (oracleState.isOracleRunning()) {
    logger.warn("Payment oracle is already running");
    return;
  }

  logger.info("Starting payment oracle service", {
    pollingIntervalMs: POLLING_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    horizonUrl: HORIZON_URL,
    smartContractVerification: ENABLE_SMART_CONTRACT_VERIFICATION,
  });

  oracleState.setRunning(true);

  // Subscribe to the shared HorizonPoller — oracle no longer polls directly.
  // The poller emits one "payment:detected" event per discovered payment per tick.
  horizonPoller.on(
    HORIZON_POLLER_EVENTS.PAYMENT_DETECTED,
    (_event: HorizonPaymentDetectedEvent) => {
      // Acknowledge receipt for metrics tracking (events_emitted vs events_processed).
      horizonPoller.acknowledgeEvent();
      metrics.increment("oracle.horizon_event.received");
    },
  );

  // Oracle tick: fetches pending payments, registers their addresses with the
  // shared poller, then verifies and updates statuses. The heavy Horizon calls
  // inside verifyPayment() are retained for full per-payment detail — the poller
  // is used for initial change detection to avoid redundant polling by multiple
  // services.
  runOracleTick().catch((error) => {
    logger.error("Initial oracle tick failed", { error: error.message });
  });

  // Schedule recurring ticks aligned to the same interval as the poller so
  // both fire once per window.
  const interval = setInterval(() => {
    if (oracleState.isOracleRunning()) {
      runOracleTick().catch((error) => {
        logger.error("Scheduled oracle tick failed", { error: error.message });
      });
    }
  }, POLLING_INTERVAL_MS);

  oracleState.setPollInterval(interval);

  // Start the shared Horizon poller (no-op if already started by another consumer).
  horizonPoller.start();

  logger.info("Payment oracle service started successfully");
}

/**
 * Stops the payment oracle service
 */
export function stopPaymentOracle(): void {
  if (!oracleState.isOracleRunning()) {
    logger.warn("Payment oracle is not running");
    return;
  }

  logger.info("Stopping payment oracle service");

  const interval = oracleState.getPollInterval();
  if (interval) {
    clearInterval(interval);
    oracleState.setPollInterval(null);
  }

  oracleState.setRunning(false);

  // Stop the shared Horizon poller — no other service polls Horizon independently.
  horizonPoller.stop();
  horizonPoller.removeAllListeners(HORIZON_POLLER_EVENTS.PAYMENT_DETECTED);

  logger.info("Payment oracle service stopped");
}

/**
 * Gets current oracle metrics
 */
export function getOracleMetrics(): OracleMetrics {
  return oracleState.getMetrics();
}

/**
 * Gets oracle health status
 */
export function getOracleHealth(): HorizonHealthCheck {
  return oracleState.getHealthCheck();
}

export interface OracleHealthResponse extends HorizonHealthCheck {
  soroban: ReturnType<typeof getSorobanHealthStatus>;
}

/**
 * Gets combined oracle + Soroban integration health for admin monitoring.
 */
export function getOracleHealthWithSoroban(): OracleHealthResponse {
  return {
    ...oracleState.getHealthCheck(),
    soroban: getSorobanHealthStatus(),
  };
}

/**
 * Manually triggers a payment verification (for testing/debugging)
 */
export async function manualVerifyPayment(paymentId: string): Promise<PaymentVerification> {
  const paymentModel = (prisma as PrismaClient & {
    payment?: { findUnique?: (args: { where: { id: string } }) => Promise<Payment | null> };
  }).payment;

  if (!paymentModel?.findUnique) {
    throw new Error(`Payment ${paymentId} not found`);
  }

  const payment = await paymentModel.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw new Error(`Payment ${paymentId} not found`);
  }

  const verification = await verifyPayment(payment);
  
  if (verification.verified) {
    const onChainVerified = await verifyPaymentOnChain(verification);
    if (!onChainVerified) {
      verification.status = "failed";
      verification.verified = false;
    }
  }

  await updatePaymentStatus(verification);

  return verification;
}
