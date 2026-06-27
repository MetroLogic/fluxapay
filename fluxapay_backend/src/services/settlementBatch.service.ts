/**
 * settlementBatch.service.ts
 *
 * Core settlement engine — runs once per batch cycle (daily at 00:00 UTC).
 *
 * Flow:
 *  1. Find all swept (swept=true), unsettled (settled=false) payments → group by merchant
 *  2. For each merchant:
 *     a. Fetch merchant + bank account
 *     b. Call exchange partner: USDC → fiat (convertAndPayout)
 *     c. Calculate fees (SETTLEMENT_FEE_PERCENT env var, default 2%)
 *     d. Create or update Settlement record
 *     e. Mark all included Payment rows as settled and link settlementId
 *     f. Send settlement.completed webhook to merchant
 *     g. Log the batch result
 */

import { Decimal } from "@prisma/client/runtime/library";
import { Merchant, PrismaClient, Prisma } from "../generated/client/client";
import { getExchangePartner } from "./exchange.service";
import { createAndDeliverWebhook } from "./webhook.service";
import { logSettlementBatch, updateSettlementBatchCompletion } from "./audit.service";

const prisma = new PrismaClient();

/** Fee percentage charged by FluxaPay (default 2%). Configurable via env. */
function getSettlementFeePercent(): number {
  const configured = parseFloat(process.env.SETTLEMENT_FEE_PERCENT ?? "2");
  return Number.isFinite(configured) ? configured : 2;
}

/** Hard limit: maximum payments per merchant per batch call (prevents OOM). */
const BATCH_PAYMENT_LIMIT = parseInt(process.env.SETTLEMENT_BATCH_LIMIT ?? "500", 10);

/** Maximum settlement retry attempts per payment before permanent failure. */
export const MAX_SETTLEMENT_RETRY_ATTEMPTS = 3;

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaymentSettlementResult {
    paymentId: string;
    status: "succeeded" | "failed" | "skipped";
    usdcAmount?: number;
    netAmount?: number;
    settlementId?: string;
    error?: string;
    retryCount?: number;
    markedForRetry?: boolean;
}

interface SettlementBatchResult {
    batchId: string;
    startedAt: Date;
    completedAt: Date;
    merchantResults: MerchantSettlementResult[];
    totalMerchantsProcessed: number;
    totalMerchantsSucceeded: number;
    totalMerchantsFailed: number;
    totalMerchantsSkipped: number;
}

interface MerchantSettlementResult {
    merchantId: string;
    businessName: string;
    status: "succeeded" | "failed" | "skipped" | "partial";
    settlementId?: string;
    usdcAmount?: number;
    fiatCurrency?: string;
    fiatGross?: number;
    feeAmount?: number;
    netAmount?: number;
    exchangeRate?: number;
    exchangeRef?: string;
    transferRef?: string;
    paymentCount?: number;
    paymentResults?: PaymentSettlementResult[];
    error?: string;
}

/**
 * Returns true if the merchant should be settled in the current batch run.
 *
 * Rules:
 *  • daily   → always true (runs every day)
 *  • weekly  → true only when today's JS day-of-week matches merchant.settlement_day
 *              (0 = Sunday … 6 = Saturday)
 *
 * @param schedule   'daily' | 'weekly'
 * @param settlementDay  0–6 (only relevant for weekly)
 * @param now        Date to evaluate against (injectable for testability)
 */
export function isMerchantDueForSettlement(
    schedule: string,
    settlementDay: number | null,
    now: Date = new Date(),
): boolean {
    if (schedule === "daily") return true;

    if (schedule === "weekly") {
        if (settlementDay === null || settlementDay === undefined) {
            // Misconfigured – log and skip rather than settling on wrong day
            console.warn(
                "[SettlementBatch] Merchant has weekly schedule but no settlement_day set – skipping.",
            );
            return false;
        }
        // Compare against UTC day-of-week so the cron (00:00 UTC) is authoritative
        return now.getUTCDay() === settlementDay;
    }

    // Unknown schedule value – skip defensively
    console.warn(`[SettlementBatch] Unknown settlement_schedule "${schedule}" – skipping merchant.`);
    return false;
}

// ─── Aggregation query ───────────────────────────────────────────────────────

interface MerchantAggregate {
    merchantId: string;
    paymentIds: string[];
    totalUsdc: number;
}

async function getUnsettledPaymentsByMerchant(runAt: Date): Promise<MerchantAggregate[]> {
    // Pre-compute which merchant IDs are due today so we skip loading
    // payments for merchants whose schedule doesn't fall on this run date.
    const todayUTCDay = runAt.getUTCDay(); // 0=Sun … 6=Sat

    const dueMerchants = await prisma.merchant.findMany({
        where: {
            OR: [
                // Daily merchants are always due
                { settlement_schedule: "daily" },
                // Weekly merchants are due only on their designated day
                { settlement_schedule: "weekly", settlement_day: todayUTCDay },
            ],
        },
        select: { id: true },
    });

    if (dueMerchants.length === 0) return [];

    const dueMerchantIds = dueMerchants.map((m) => m.id);

    // Raw grouping query – Prisma's groupBy aggregation doesn't easily return ids,
    // so we fetch payment rows and group in-process.
    const payments = await prisma.payment.findMany({
        where: {
            swept: true,
            settled: false,
            merchantId: { in: dueMerchantIds },
        },
        select: {
            id: true,
            merchantId: true,
            amount: true,
        },
        orderBy: { createdAt: "asc" },
        take: BATCH_PAYMENT_LIMIT,
    });

    // Group by merchantId
    const map = new Map<string, MerchantAggregate>();
    for (const p of payments) {
        const existing = map.get(p.merchantId);
        const amt = Number(p.amount as Decimal);
        if (existing) {
            existing.paymentIds.push(p.id);
            existing.totalUsdc = parseFloat((existing.totalUsdc + amt).toFixed(7));
        } else {
            map.set(p.merchantId, {
                merchantId: p.merchantId,
                paymentIds: [p.id],
                totalUsdc: amt,
            });
        }
    }

    return Array.from(map.values());
}

// ─── Retry helpers (stored in Payment.metadata) ──────────────────────────────

function getPaymentRetryCount(metadata: unknown): number {
    if (!metadata || typeof metadata !== "object") return 0;
    const count = (metadata as Record<string, unknown>).settlement_retry_count;
    return typeof count === "number" ? count : 0;
}

function buildRetryMetadata(metadata: unknown, retryCount: number, failureReason: string) {
    const base = metadata && typeof metadata === "object" ? { ...(metadata as Record<string, unknown>) } : {};
    return {
        ...base,
        settlement_retry_count: retryCount,
        last_settlement_failure: failureReason,
        settlement_retry_scheduled: true,
    };
}

// ─── Per-payment settlement ───────────────────────────────────────────────────

async function settleSinglePayment(
    paymentId: string,
    merchant: Merchant & { webhook_url: string | null; settlement_currency: string },
    bankAccount: {
        account_name: string;
        account_number: string;
        bank_name: string;
        bank_code?: string | null;
        currency: string;
        country: string;
    },
    settlementCurrency: string,
    schedule: string,
    settlementDay: number | null,
    now: Date,
): Promise<PaymentSettlementResult> {
    const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, amount: true, metadata: true, settled: true },
    });

    if (!payment || payment.settled) {
        return { paymentId, status: "skipped", error: "Payment not found or already settled" };
    }

    const totalUsdc = Number(payment.amount as Decimal);
    if (totalUsdc <= 0) {
        return { paymentId, status: "skipped", error: "Zero USDC to settle" };
    }

    const retryCount = getPaymentRetryCount(payment.metadata);
    const batchDate = now.toISOString().split("T")[0];
    const settlementRef = `SETTLE_${paymentId.slice(-8).toUpperCase()}_${batchDate}`;

    try {
        const partner = getExchangePartner();
        const payout = await partner.convertAndPayout(
            totalUsdc,
            settlementCurrency,
            {
                account_name: bankAccount.account_name,
                account_number: bankAccount.account_number,
                bank_name: bankAccount.bank_name,
                bank_code: bankAccount.bank_code ?? undefined,
                currency: bankAccount.currency,
                country: bankAccount.country,
            },
            settlementRef,
        );

        const quote = await partner.getQuote(totalUsdc, settlementCurrency);
        const fiatGross = quote.fiat_gross;
        const exchangeRate = quote.exchange_rate;
        const feeAmount = parseFloat(
            ((fiatGross * getSettlementFeePercent()) / 100).toFixed(2),
        );
        const netAmount = parseFloat((fiatGross - feeAmount).toFixed(2));

        const settlement = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const s = await tx.settlement.create({
                data: {
                    merchantId: merchant.id,
                    usdc_amount: new Decimal(totalUsdc),
                    amount: new Decimal(fiatGross),
                    currency: settlementCurrency,
                    fees: new Decimal(feeAmount),
                    net_amount: new Decimal(netAmount),
                    exchange_partner: process.env.EXCHANGE_PARTNER ?? "mock",
                    exchange_rate: new Decimal(exchangeRate),
                    exchange_ref: payout.exchange_ref,
                    bank_transfer_id: payout.transfer_ref,
                    payment_ids: [paymentId],
                    payout_partner_payload: payout.raw_partner_payload || null,
                    status: "completed",
                    scheduled_date: now,
                    processed_date: now,
                    breakdown: {
                        usdc_amount: totalUsdc,
                        exchange_rate: exchangeRate,
                        fiat_gross: fiatGross,
                        fee_percent: getSettlementFeePercent(),
                        fee_amount: feeAmount,
                        net_amount: netAmount,
                        payment_count: 1,
                        settlement_schedule: schedule,
                        settlement_day: settlementDay,
                        retry_count: retryCount,
                    },
                },
            });

            await tx.payment.update({
                where: { id: paymentId },
                data: {
                    settled: true,
                    settled_at: now,
                    settlement_ref: settlementRef,
                    settlement_fiat_amount: new Decimal(netAmount),
                    settlement_fiat_currency: settlementCurrency,
                    settlementId: s.id,
                    metadata: buildRetryMetadata(payment.metadata, 0, ""),
                },
            });

            return s;
        });

        console.log(
            `[SettlementBatch] ✅ Payment ${paymentId} settled → ${netAmount} ${settlementCurrency}`,
        );

        return {
            paymentId,
            status: "succeeded",
            usdcAmount: totalUsdc,
            netAmount,
            settlementId: settlement.id,
            retryCount: 0,
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const newRetryCount = retryCount + 1;
        const markedForRetry = newRetryCount < MAX_SETTLEMENT_RETRY_ATTEMPTS;

        console.error(
            `[SettlementBatch] ❌ Payment ${paymentId} failed (attempt ${newRetryCount}/${MAX_SETTLEMENT_RETRY_ATTEMPTS}): ${errMsg}`,
        );

        try {
            await prisma.payment.update({
                where: { id: paymentId },
                data: {
                    metadata: buildRetryMetadata(payment.metadata, newRetryCount, errMsg),
                },
            });

            await prisma.settlement.create({
                data: {
                    merchantId: merchant.id,
                    usdc_amount: new Decimal(totalUsdc),
                    amount: new Decimal(0),
                    currency: settlementCurrency,
                    fees: new Decimal(0),
                    net_amount: new Decimal(0),
                    payment_ids: [paymentId],
                    status: "failed",
                    scheduled_date: now,
                    failure_reason: errMsg,
                    breakdown: {
                        retry_count: newRetryCount,
                        marked_for_retry: markedForRetry,
                        payment_id: paymentId,
                    },
                },
            });

            if (!markedForRetry && merchant.webhook_url) {
                createAndDeliverWebhook(
                    merchant.id,
                    "settlement_failed",
                    {
                        event: "settlement.failed",
                        merchant_id: merchant.id,
                        payment_ids: [paymentId],
                        usdc_amount: totalUsdc,
                        error: errMsg,
                        retry_count: newRetryCount,
                        failed_at: now.toISOString(),
                    },
                ).catch(() => { });

                console.error(
                    `[SettlementBatch] [OPS ALERT] Payment ${paymentId} permanently failed after ${MAX_SETTLEMENT_RETRY_ATTEMPTS} retries`,
                );
            }
        } catch (recordErr) {
            console.error(
                `[SettlementBatch] Could not record failure for payment ${paymentId}:`,
                recordErr,
            );
        }

        return {
            paymentId,
            status: "failed",
            error: errMsg,
            retryCount: newRetryCount,
            markedForRetry,
        };
    }
}

// ─── Per-merchant settlement ──────────────────────────────────────────────────

async function settleMerchant(
    aggregate: MerchantAggregate,
    now: Date,
): Promise<MerchantSettlementResult> {
    const { merchantId, paymentIds, totalUsdc } = aggregate;

    // 1. Load merchant + bank account (include schedule fields)
    const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        include: { bankAccount: true },
    });

    if (!merchant) {
        return {
            merchantId,
            businessName: "Unknown",
            status: "failed",
            error: "Merchant not found in database",
        };
    }

    // 2. ── SCHEDULE CHECK ──────────────────────────────────────────────────────
    //    Skip if this merchant isn't due today.
    const schedule = (merchant as Merchant).settlement_schedule as string ?? "daily";
    const settlementDay = (merchant as Merchant).settlement_day as number | null ?? null;

    if (!isMerchantDueForSettlement(schedule, settlementDay, now)) {
        return {
            merchantId,
            businessName: merchant.business_name,
            status: "skipped",
            error: `Not due today (schedule=${schedule}, settlement_day=${settlementDay ?? "n/a"})`,
        };
    }

    // 3. Guard: bank account must exist
    if (!merchant.bankAccount) {
        return {
            merchantId,
            businessName: merchant.business_name,
            status: "skipped",
            error: "No bank account on file – settlement skipped",
        };
    }

    if (totalUsdc <= 0) {
        return {
            merchantId,
            businessName: merchant.business_name,
            status: "skipped",
            error: "Zero USDC to settle",
        };
    }

    const settlementCurrency = merchant.settlement_currency;
    const bankAccount = merchant.bankAccount;

    // Process each payment independently — one failure does not abort others
    const paymentResults: PaymentSettlementResult[] = [];
    for (const paymentId of paymentIds) {
        const result = await settleSinglePayment(
            paymentId,
            merchant,
            bankAccount,
            settlementCurrency,
            schedule,
            settlementDay,
            now,
        );
        paymentResults.push(result);
    }

    const succeededPayments = paymentResults.filter((r) => r.status === "succeeded");
    const failedPayments = paymentResults.filter((r) => r.status === "failed");
    const totalNet = succeededPayments.reduce((sum, r) => sum + (r.netAmount ?? 0), 0);
    const totalUsdcSettled = succeededPayments.reduce((sum, r) => sum + (r.usdcAmount ?? 0), 0);

    let merchantStatus: MerchantSettlementResult["status"];
    if (failedPayments.length === 0 && succeededPayments.length > 0) {
        merchantStatus = "succeeded";
    } else if (succeededPayments.length === 0 && failedPayments.length > 0) {
        merchantStatus = "failed";
    } else if (succeededPayments.length > 0 && failedPayments.length > 0) {
        merchantStatus = "partial";
    } else {
        merchantStatus = "skipped";
    }

    if (merchantStatus === "succeeded" && merchant.webhook_url) {
        createAndDeliverWebhook(
            merchantId,
            "settlement_completed",
            {
                event: "settlement.completed",
                merchant_id: merchantId,
                payment_ids: succeededPayments.map((p) => p.paymentId),
                total_payments: succeededPayments.length,
                usdc_amount: totalUsdcSettled,
                net_amount: totalNet,
                settled_at: now.toISOString(),
            },
        ).catch((err: unknown) => {
            console.error(
                `[SettlementBatch] Webhook delivery failed for merchant ${merchantId}:`,
                err,
            );
        });
    }

    console.log(
        `[SettlementBatch] Merchant ${merchant.business_name} (${merchantId}): ` +
        `${succeededPayments.length} succeeded, ${failedPayments.length} failed`,
    );

    return {
        merchantId,
        businessName: merchant.business_name,
        status: merchantStatus,
        usdcAmount: totalUsdcSettled,
        fiatCurrency: settlementCurrency,
        netAmount: totalNet,
        paymentCount: paymentIds.length,
        paymentResults,
        error: failedPayments.length > 0
            ? `${failedPayments.length} payment(s) failed`
            : undefined,
    };
}

// ─── Main batch runner ────────────────────────────────────────────────────────

/**
 * Run the full settlement batch for all eligible merchants.
 *
 * This function is idempotent-safe at the row level: payments flagged
 * `settled=true` are excluded from subsequent runs even if the job crashes.
 */
export async function runSettlementBatch(
    runAt: Date = new Date(),
    adminId: string = 'system',
): Promise<SettlementBatchResult> {
    const batchId = `batch_${Date.now()}`;
    const startedAt = runAt;

    console.log(
        `[SettlementBatch] 🚀 Starting batch ${batchId} at ${startedAt.toISOString()} ` +
        `(UTC day=${startedAt.getUTCDay()})`,
    );

    // Create audit log for batch initiation
    const auditLog = await logSettlementBatch({
        adminId,
        batchId,
        reason: 'Scheduled settlement batch run',
    });

    const aggregates = await getUnsettledPaymentsByMerchant(runAt);

    if (aggregates.length === 0) {
        const completedAt = new Date();
        console.log(
            "[SettlementBatch] No unsettled payments found. Batch complete.",
        );

        // Update audit log with completion
        if (auditLog) {
            await updateSettlementBatchCompletion({
                auditLogId: auditLog.id,
                status: 'completed',
                transactionCount: 0,
                totalAmount: 0,
                currency: 'USD',
            });
        }

        return {
            batchId,
            startedAt,
            completedAt,
            merchantResults: [],
            totalMerchantsProcessed: 0,
            totalMerchantsSucceeded: 0,
            totalMerchantsFailed: 0,
            totalMerchantsSkipped: 0,
        };
    }

    console.log(
        `[SettlementBatch] Found ${aggregates.length} merchant(s) with unsettled payments.`,
    );

    // Process merchants sequentially to avoid overwhelming the exchange API
    const merchantResults: MerchantSettlementResult[] = [];
    for (const agg of aggregates) {
        const result = await settleMerchant(agg, runAt);
        merchantResults.push(result);
    }

    const completedAt = new Date();
    const succeeded = merchantResults.filter(
        (r) => r.status === "succeeded" || r.status === "partial",
    ).length;
    const failed = merchantResults.filter((r) => r.status === "failed").length;
    const partial = merchantResults.filter((r) => r.status === "partial").length;
    const skipped = merchantResults.filter((r) => r.status === "skipped").length;

    console.log(
        `[SettlementBatch] 🏁 Batch ${batchId} complete | ` +
        `${succeeded} succeeded/partial, ${failed} failed, ${partial} partial, ${skipped} skipped | ` +
        `Duration: ${completedAt.getTime() - startedAt.getTime()}ms`,
    );

    // Calculate total amount settled
    const totalAmount = merchantResults
        .filter(r => r.status === 'succeeded' || r.status === 'partial')
        .reduce((sum, r) => sum + (r.netAmount ? parseFloat(r.netAmount.toString()) : 0), 0);

    const batchStatus: "completed" | "failed" | "partial" =
        failed === 0 ? "completed" : succeeded > 0 ? "partial" : "failed";

    const auditMerchantResults = merchantResults.map((r) => ({
        merchantId: r.merchantId,
        status: r.status,
        payment_results: r.paymentResults?.map((p) => ({
            paymentId: p.paymentId,
            status: p.status,
            error: p.error,
            retry_count: p.retryCount,
        })),
    }));

    // Update audit log with completion
    if (auditLog) {
        await updateSettlementBatchCompletion({
            auditLogId: auditLog.id,
            status: batchStatus,
            transactionCount: succeeded,
            totalAmount,
            currency: 'USD',
            failureReason: failed > 0 ? `${failed} merchant settlement(s) failed` : undefined,
            merchantResults: auditMerchantResults,
        });
    }

    return {
        batchId,
        startedAt,
        completedAt,
        merchantResults,
        totalMerchantsProcessed: merchantResults.length,
        totalMerchantsSucceeded: succeeded,
        totalMerchantsFailed: failed,
        totalMerchantsSkipped: skipped,
    };
}
