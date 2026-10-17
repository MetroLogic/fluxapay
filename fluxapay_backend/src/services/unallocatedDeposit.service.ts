/**
 * Unallocated deposits queue (issue #1258).
 *
 * Deposits that cannot be safely credited to a charge — missing/invalid memo,
 * counterfeit or unsupported asset, underpaid amount — are recorded here for
 * manual review instead of being silently ignored.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../config/prisma";
import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { getLogger, getMetricsCollector } from "../utils/logger";
import type { StellarMemo } from "../utils/oracleMemo.util";
import type { HorizonPaymentOperation, UnallocatedReason } from "../utils/depositVerification.util";

const logger = getLogger("UnallocatedDeposits");
const metrics = getMetricsCollector();

export type UnallocatedStatus = "pending_review" | "resolved" | "refunded" | "ignored";

export interface RecordUnallocatedInput {
  operation: HorizonPaymentOperation;
  destination: string;
  reason: UnallocatedReason;
  memo?: StellarMemo;
  candidatePaymentId?: string | null;
  details?: Record<string, unknown>;
}

type UnallocatedDepositDelegate = {
  upsert: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
  count: (args: unknown) => Promise<number>;
  findUnique: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
};

function delegate(): UnallocatedDepositDelegate | undefined {
  return (prisma as unknown as { unallocatedDeposit?: UnallocatedDepositDelegate }).unallocatedDeposit;
}

/**
 * Record (idempotently) a deposit that needs review. Keyed by Horizon
 * operation id + reason, so repeated oracle ticks never duplicate rows.
 * Never throws: failing to record must not stop payment monitoring.
 */
export async function recordUnallocatedDeposit(input: RecordUnallocatedInput): Promise<boolean> {
  const op = input.operation;
  const operationId = op.id ?? op.paging_token;
  if (!operationId || !op.transaction_hash) {
    logger.warn("Cannot record unallocated deposit without operation id and tx hash", {
      reason: input.reason,
    });
    return false;
  }

  const memoValue =
    input.memo && input.memo.type !== "none" && input.memo.value !== undefined
      ? String(input.memo.value)
      : null;

  try {
    const model = delegate();
    if (!model) throw new Error("unallocatedDeposit model unavailable");
    await model.upsert({
      where: { operation_id_reason: { operation_id: operationId, reason: input.reason } },
      create: {
        transaction_hash: op.transaction_hash,
        operation_id: operationId,
        destination_address: input.destination,
        source_address: op.from ?? null,
        asset_type: op.asset_type ?? "unknown",
        asset_code: op.asset_code ?? null,
        asset_issuer: op.asset_issuer ?? null,
        amount: new Decimal(op.amount ?? "0"),
        memo_type: input.memo?.type ?? null,
        memo: memoValue,
        reason: input.reason,
        candidate_payment_id: input.candidatePaymentId ?? null,
        details: (input.details ?? {}) as object,
      },
      update: {},
    });
    metrics.increment("deposits.unallocated", { reason: input.reason });
    logger.warn("Deposit flagged for manual review", {
      reason: input.reason,
      transactionHash: op.transaction_hash,
      destination: input.destination,
      assetCode: op.asset_code,
      assetIssuer: op.asset_issuer,
      amount: op.amount,
      candidatePaymentId: input.candidatePaymentId ?? undefined,
    });
    return true;
  } catch (error) {
    logger.error("Failed to record unallocated deposit", {
      reason: input.reason,
      transactionHash: op.transaction_hash,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function listUnallocatedDeposits(params: {
  status?: UnallocatedStatus;
  reason?: UnallocatedReason;
  page?: number;
  limit?: number;
}) {
  const model = delegate();
  if (!model) throw new Error("unallocatedDeposit model unavailable");
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.reason) where.reason = params.reason;

  const [rows, total] = await Promise.all([
    model.findMany({ where, orderBy: { created_at: "desc" }, skip: (page - 1) * limit, take: limit }),
    model.count({ where }),
  ]);
  return { data: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

/** Close out a reviewed deposit. Only `pending_review` rows can be resolved. */
export async function reviewUnallocatedDeposit(params: {
  id: string;
  status: Exclude<UnallocatedStatus, "pending_review">;
  reviewedBy: string;
  note?: string;
  paymentId?: string;
}) {
  const model = delegate();
  if (!model) throw new Error("unallocatedDeposit model unavailable");
  const existing = (await model.findUnique({ where: { id: params.id } })) as { status?: string } | null;
  if (!existing) {
    throw apiError(404, ErrorCode.NOT_FOUND, "Unallocated deposit not found");
  }
  if (existing.status !== "pending_review") {
    throw apiError(409, ErrorCode.CONFLICT, `Deposit already ${existing.status}`);
  }
  return model.update({
    where: { id: params.id },
    data: {
      status: params.status,
      reviewed_at: new Date(),
      reviewed_by: params.reviewedBy,
      resolution_note: params.note ?? null,
      ...(params.paymentId ? { candidate_payment_id: params.paymentId } : {}),
    },
  });
}
