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
import { Merchant, PrismaClient } from "../generated/client/client";
import { getExchangePartner } from "./exchange.service";
import { createAndDeliverWebhook } from "./webhook.service";

const prisma = new PrismaClient();

/** Fee percentage charged by FluxaPay (default 2%). Configurable via env. */
const FEE_PERCENT = parseFloat(process.env.SETTLEMENT_FEE_PERCENT ?? "2");

/** Hard limit: maximum payments per merchant per batch call (prevents OOM). */
const BATCH_PAYMENT_LIMIT = parseInt(process.env.SETTLEMENT_BATCH_LIMIT ?? "500", 10);

// ─── Types ───────────────────────────────────────────────────────────────────

interface SettlementBatchResult {
    batchId: string;
    startedAt: Date;
    completedAt: Date;
    merchantResults: MerchantSettlementResult[];
    totalMerchantsProcessed: number;
    totalMerchantsSucceeded: number;
    totalMerchantsFailed: number;
}

interface MerchantSettlementResult {
    merchantId: string;
    businessName: string;
    status: "succeeded" | "failed" | "skipped";
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

async function getUnsettledPaymentsByMerchant(): Promise<MerchantAggregate[]> {
    // Raw grouping query – Prisma's groupBy aggregation doesn't easily return ids,
    // so we fetch payment rows and group in-process.
    const payments = await prisma.payment.findMany({
        where: {
            swept: true,
            settled: false,
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

    try {
        // 4. Build a unique reference for idempotency
        const batchDate = now.toISOString().split("T")[0]; // YYYY-MM-DD
        const settlementRef = `SETTLE_${merchantId.slice(-6).toUpperCase()}_${batchDate}_${Date.now()}`;

        // 5. Convert USDC → fiat + initiate bank transfer
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

        // 6. Get the quote to record exchange rate & fiat gross
        const quote = await partner.getQuote(totalUsdc, settlementCurrency);
        const fiatGross = quote.fiat_gross;
        const exchangeRate = quote.exchange_rate;

        // 7. Calculate fee and net
        const feeAmount = parseFloat(
            ((fiatGross * FEE_PERCENT) / 100).toFixed(2),
        );
        const netAmount = parseFloat((fiatGross - feeAmount).toFixed(2));

        // 8. Create Settlement record inside a transaction
        const settlement = await prisma.$transaction(async (tx) => {
            const s = await tx.settlement.create({
                data: {
                    merchantId,
                    usdc_amount: new Decimal(totalUsdc),
                    amount: new Decimal(fiatGross),
                    currency: settlementCurrency,
                    fees: new Decimal(feeAmount),
                    net_amount: new Decimal(netAmount),
                    exchange_partner: process.env.EXCHANGE_PARTNER ?? "mock",
                    exchange_rate: new Decimal(exchangeRate),
                    exchange_ref: payout.exchange_ref,
                    bank_transfer_id: payout.transfer_ref,
                    payment_ids: paymentIds,
                    status: "completed",
                    scheduled_date: now,
                    processed_date: now,
                    breakdown: {
                        usdc_amount: totalUsdc,
                        exchange_rate: exchangeRate,
                        fiat_gross: fiatGross,
                        fee_percent: FEE_PERCENT,
                        fee_amount: feeAmount,
                        net_amount: netAmount,
                        payment_count: paymentIds.length,
                        settlement_schedule: schedule,
                        settlement_day: settlementDay,
                    },
                },
            });

            // Link & mark each payment as settled
            await tx.payment.updateMany({
                where: { id: { in: paymentIds } },
                data: {
                    settled: true,
                    settled_at: now,
                    settlement_ref: settlementRef,
                    settlement_fiat_amount: new Decimal(netAmount),
                    settlement_fiat_currency: settlementCurrency,
                    settlementId: s.id,
                },
            });

            return s;
        });

        // 9. Fire merchant webhook (non-blocking)
        if (merchant.webhook_url) {
            const webhookPayload = {
                event: "settlement.completed",
                settlement_id: settlement.id,
                merchant_id: merchantId,
                payment_ids: paymentIds,
                total_payments: paymentIds.length,
                usdc_amount: totalUsdc,
                settlement_currency: settlementCurrency,
                fiat_gross: fiatGross,
                settlement_fee: feeAmount,
                net_amount: netAmount,
                exchange_rate: exchangeRate,
                exchange_ref: payout.exchange_ref,
                bank_transfer_ref: payout.transfer_ref,
                settled_at: now.toISOString(),
            };

            createAndDeliverWebhook(
                merchantId,
                "settlement_completed",
                webhookPayload,
            ).catch((err: unknown) => {
                console.error(
                    `[SettlementBatch] Webhook delivery failed for merchant ${merchantId}:`,
                    err,
                );
            });
        }

        console.log(
            `[SettlementBatch] ✅ Merchant ${merchant.business_name} (${merchantId}): ` +
            `${totalUsdc} USDC → ${netAmount} ${settlementCurrency} | ref: ${payout.transfer_ref}`,
        );

        return {
            merchantId,
            businessName: merchant.business_name,
            status: "succeeded",
            settlementId: settlement.id,
            usdcAmount: totalUsdc,
            fiatCurrency: settlementCurrency,
            fiatGross,
            feeAmount,
            netAmount,
            exchangeRate,
            exchangeRef: payout.exchange_ref,
            transferRef: payout.transfer_ref,
            paymentCount: paymentIds.length,
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(
            `[SettlementBatch] ❌ Failed to settle merchant ${merchantId}: ${errMsg}`,
        );

        // Record a failed settlement row for audit / retry
        try {
            await prisma.settlement.create({
                data: {
                    merchantId,
                    usdc_amount: new Decimal(totalUsdc),
                    amount: new Decimal(0),
                    currency: merchant.settlement_currency,
                    fees: new Decimal(0),
                    net_amount: new Decimal(0),
                    payment_ids: paymentIds,
                    status: "failed",
                    scheduled_date: now,
                    failure_reason: errMsg,
                },
            });

            if (merchant.webhook_url) {
                createAndDeliverWebhook(
                    merchantId,
                    "settlement_failed",
                    {
                        event: "settlement.failed",
                        merchant_id: merchantId,
                        payment_ids: paymentIds,
                        usdc_amount: totalUsdc,
                        error: errMsg,
                        failed_at: now.toISOString(),
                    },
                ).catch(() => { });
            }
        } catch (recordErr) {
            console.error(
                `[SettlementBatch] Could not record failure row for merchant ${merchantId}:`,
                recordErr,
            );
        }

        return {
            merchantId,
            businessName: merchant.business_name,
            status: "failed",
            error: errMsg,
        };
    }
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
): Promise<SettlementBatchResult> {
    const batchId = `batch_${Date.now()}`;
    const startedAt = runAt;

    console.log(
        `[SettlementBatch] 🚀 Starting batch ${batchId} at ${startedAt.toISOString()} ` +
        `(UTC day=${startedAt.getUTCDay()})`,
    );

    const aggregates = await getUnsettledPaymentsByMerchant();

    if (aggregates.length === 0) {
        const completedAt = new Date();
        console.log(
            "[SettlementBatch] No unsettled payments found. Batch complete.",
        );
        return {
            batchId,
            startedAt,
            completedAt,
            merchantResults: [],
            totalMerchantsProcessed: 0,
            totalMerchantsSucceeded: 0,
            totalMerchantsFailed: 0,
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
        (r) => r.status === "succeeded",
    ).length;
    const failed = merchantResults.filter((r) => r.status === "failed").length;
    const skipped = merchantResults.filter((r) => r.status === "skipped").length;

    console.log(
        `[SettlementBatch] 🏁 Batch ${batchId} complete | ` +
        `${succeeded} succeeded, ${failed} failed, ${skipped} skipped | ` +
        `Duration: ${completedAt.getTime() - startedAt.getTime()}ms`,
    );

    return {
        batchId,
        startedAt,
        completedAt,
        merchantResults,
        totalMerchantsProcessed: merchantResults.length,
        totalMerchantsSucceeded: succeeded,
        totalMerchantsFailed: failed,
    };
}
