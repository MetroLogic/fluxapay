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
import { PrismaClient } from "../generated/client/client";
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
): Promise<MerchantSettlementResult> {
    const { merchantId, paymentIds, totalUsdc } = aggregate;

    // 1. Load merchant + bank account
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
        // 2. Build a unique reference for idempotency
        const batchDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        const settlementRef = `SETTLE_${merchantId.slice(-6).toUpperCase()}_${batchDate}_${Date.now()}`;

        // 3. Convert USDC → fiat + initiate bank transfer
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

        // 4. Get the quote to record exchange rate & fiat gross
        const quote = await partner.getQuote(totalUsdc, settlementCurrency);
        const fiatGross = quote.fiat_gross;
        const exchangeRate = quote.exchange_rate;

        // 5. Calculate fee and net
        const feeAmount = parseFloat(((fiatGross * FEE_PERCENT) / 100).toFixed(2));
        const netAmount = parseFloat((fiatGross - feeAmount).toFixed(2));

        // 6. Create Settlement record inside a transaction
        const settlement = await prisma.$transaction(async (tx) => {
            // Create the settlement record
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
                    scheduled_date: new Date(),
                    processed_date: new Date(),
                    breakdown: {
                        usdc_amount: totalUsdc,
                        exchange_rate: exchangeRate,
                        fiat_gross: fiatGross,
                        fee_percent: FEE_PERCENT,
                        fee_amount: feeAmount,
                        net_amount: netAmount,
                        payment_count: paymentIds.length,
                    },
                },
            });

            // Link & mark each payment as settled
            await tx.payment.updateMany({
                where: { id: { in: paymentIds } },
                data: {
                    settled: true,
                    settled_at: new Date(),
                    settlement_ref: settlementRef,
                    settlement_fiat_amount: new Decimal(netAmount),
                    settlement_fiat_currency: settlementCurrency,
                    settlementId: s.id,
                },
            });

            return s;
        });

        // 7. Fire merchant webhook (non-blocking – failure here must not abort the settled record)
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
                settled_at: new Date().toISOString(),
            };

            createAndDeliverWebhook(
                merchantId,
                "settlement_completed",
                merchant.webhook_url,
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

        // Record a failed settlement row so we can audit / retry
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
                    scheduled_date: new Date(),
                    failure_reason: errMsg,
                },
            });

            // Deliver failed webhook if URL is configured
            if (merchant.webhook_url) {
                createAndDeliverWebhook(
                    merchantId,
                    "settlement_failed",
                    merchant.webhook_url,
                    {
                        event: "settlement.failed",
                        merchant_id: merchantId,
                        payment_ids: paymentIds,
                        usdc_amount: totalUsdc,
                        error: errMsg,
                        failed_at: new Date().toISOString(),
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
export async function runSettlementBatch(): Promise<SettlementBatchResult> {
    const batchId = `batch_${Date.now()}`;
    const startedAt = new Date();

    console.log(`[SettlementBatch] 🚀 Starting batch ${batchId} at ${startedAt.toISOString()}`);

    // Aggregate unsettled payments
    const aggregates = await getUnsettledPaymentsByMerchant();

    if (aggregates.length === 0) {
        const completedAt = new Date();
        console.log("[SettlementBatch] No unsettled payments found. Batch complete.");
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

    console.log(`[SettlementBatch] Found ${aggregates.length} merchant(s) with unsettled payments.`);

    // Process merchants sequentially to avoid overwhelming the exchange API
    const merchantResults: MerchantSettlementResult[] = [];
    for (const agg of aggregates) {
        const result = await settleMerchant(agg);
        merchantResults.push(result);
    }

    const completedAt = new Date();
    const succeeded = merchantResults.filter((r) => r.status === "succeeded").length;
    const failed = merchantResults.filter((r) => r.status === "failed").length;

    console.log(
        `[SettlementBatch] 🏁 Batch ${batchId} complete | ` +
        `${succeeded} succeeded, ${failed} failed, ` +
        `${merchantResults.length - succeeded - failed} skipped | ` +
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
