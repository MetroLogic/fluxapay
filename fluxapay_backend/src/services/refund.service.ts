import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import {
  PrismaClient,
  RefundStatus,
  WebhookEventType,
  Prisma,
} from "../generated/client/client";
import { prisma } from "../config/prisma";
import { createAndDeliverWebhook } from "./webhook.service";
import { PaymentStatus, getRefundableStatuses } from "../types/payment";
import { StellarRefundService } from "./refund.stellar.service";
import { Decimal } from "@prisma/client/runtime/library";

const AUTOMATIC_OVERPAYMENT_REASON = "automatic_overpayment";
const MINIMUM_AUTOMATIC_REFUND =
  Number(process.env.STELLAR_MAX_FEE || "2000") / 10_000_000;

export function calculateExcessRefundAmount(
  amountReceived: number | string,
  amountExpected: number | string,
  feeThreshold = Number(process.env.STELLAR_MAX_FEE || "2000") / 10_000_000,
): number | null {
  try {
    const excess = new Decimal(amountReceived).minus(amountExpected);
    return excess.greaterThan(feeThreshold) ? excess.toNumber() : null;
  } catch {
    return null;
  }
}

export async function createAutomaticExcessRefundService(params: {
  merchantId: string;
  paymentId: string;
  amountReceived: number | string;
  amountExpected: number | string;
}) {
  const { merchantId, paymentId, amountReceived, amountExpected } = params;
  const excessAmount = calculateExcessRefundAmount(amountReceived, amountExpected);
  if (excessAmount === null) return null;

  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT id FROM "Payment"
        WHERE id = ${paymentId} AND "merchantId" = ${merchantId}
        FOR UPDATE
      `;

      const payment = await tx.payment.findFirst({
        where: { id: paymentId, merchantId },
        select: { payer_address: true, currency: true },
      });
      if (!payment?.payer_address) return null;

      const activeRefunds = await tx.refund.findMany({
        where: {
          paymentId,
          reason: AUTOMATIC_OVERPAYMENT_REASON,
          status: { in: ["pending", "processing", "completed"] },
        },
      });
      const failedRefund = await tx.refund.findFirst({
        where: {
          paymentId,
          reason: AUTOMATIC_OVERPAYMENT_REASON,
          status: "failed",
        },
      });
      if (failedRefund) return null;

      const committedAmount = activeRefunds
        .filter((refund) => refund.status !== "pending")
        .reduce((sum, refund) => sum + Number(refund.amount), 0);
      const pendingRefund = activeRefunds.find((refund) => refund.status === "pending");
      const remainingExcess = excessAmount - committedAmount;

      if (pendingRefund) {
        if (remainingExcess > 0 && Number(pendingRefund.amount) !== remainingExcess) {
          return tx.refund.update({
            where: { id: pendingRefund.id },
            data: { amount: remainingExcess },
          });
        }
        return pendingRefund;
      }
      if (activeRefunds.some((refund) => refund.status === "processing")) return null;
      if (remainingExcess <= MINIMUM_AUTOMATIC_REFUND) {
        return null;
      }

      return tx.refund.create({
        data: {
          merchantId,
          paymentId,
          amount: remainingExcess,
          currency: payment.currency,
          reason: AUTOMATIC_OVERPAYMENT_REASON,
          status: "pending",
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function executeAutomaticExcessRefundService(params: {
  merchantId: string;
  paymentId: string;
}) {
  const { merchantId, paymentId } = params;
  const refund = await prisma.refund.findFirst({
    where: {
      merchantId,
      paymentId,
      reason: AUTOMATIC_OVERPAYMENT_REASON,
      status: "pending",
    },
    include: { payment: true },
    orderBy: { created_at: "desc" },
  });

  if (!refund) {
    throw apiError(404, ErrorCode.REFUND_NOT_FOUND, "No pending excess refund found for this payment");
  }
  if (!refund.payment.payer_address) {
    throw apiError(400, ErrorCode.VALIDATION_ERROR, "Payment has no customer Stellar return address");
  }

  const claimed = await prisma.refund.updateMany({
    where: { id: refund.id, status: "pending" },
    data: { status: "processing" },
  });
  if (claimed.count !== 1) {
    throw apiError(409, ErrorCode.VALIDATION_ERROR, "Excess refund is already being processed");
  }

  let execution;
  try {
    execution = await new StellarRefundService().executeRefund({
      refundId: refund.id,
      merchantId,
      paymentId,
      customerAddress: refund.payment.payer_address,
      amount: Number(refund.amount).toFixed(7),
      currency: refund.currency,
    });
  } catch (error: any) {
    await updateRefundStatusService({
      merchantId,
      refund_id: refund.id,
      status: "failed",
      failed_reason: error?.message || "Stellar refund execution failed",
    });
    throw error;
  }

  const result = await updateRefundStatusService({
    merchantId,
    refund_id: refund.id,
    status: "completed",
  });
  return { ...result, transaction_hash: execution.transactionHash };
}

/**
 * Validates that a payment can be refunded
 * - Payment must belong to the merchant
 * - Payment status must be 'confirmed' (refundable state)
 * - Payment must not be expired or failed
 */
async function validatePaymentForRefund(
  paymentId: string,
  merchantId: string,
  tx: Prisma.TransactionClient,
) {
  const payment = await tx.payment.findFirst({
    where: { id: paymentId, merchantId },
    include: {
      refunds: {
        where: {
          status: { in: ["pending", "processing", "completed"] },
        },
      },
    },
  });

  if (!payment) {
    const paymentExists = await tx.payment.findUnique({
      where: { id: paymentId },
    });

    if (!paymentExists) {
      throw apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found");
    }
    throw apiError(403, ErrorCode.FORBIDDEN, "Payment does not belong to your merchant account");
  }

  // Validate payment status is refundable
  const refundableStatuses = getRefundableStatuses();
  if (!refundableStatuses.includes(payment.status as PaymentStatus)) {
    throw apiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `Payment cannot be refunded. Current status: ${payment.status}. Only ${refundableStatuses.join(" or ")} payments can be refunded.`,
    );
  }

  // Check if payment has expired
  if (
    payment.status === PaymentStatus.PENDING &&
    payment.expiration &&
    new Date(payment.expiration) < new Date()
  ) {
    throw apiError(400, ErrorCode.PAYMENT_EXPIRED, "Payment has expired and cannot be refunded");
  }

  return payment;
}

/**
 * Calculates total refunded/pending amount for a payment
 * Includes: pending, processing, and completed refunds
 * Excludes: failed and rejected refunds
 */
function calculateTotalRefunded(payment: any): number {
  return payment.refunds.reduce((total: number, refund: any) => {
    if (["pending", "processing", "completed"].includes(refund.status)) {
      return total + Number(refund.amount);
    }
    return total;
  }, 0);
}

/**
 * Validates refund amount against payment amount and already refunded amounts
 */
function validateRefundAmount(
  payment: any,
  refundAmount: number,
  isPartialRefundAllowed: boolean = true,
) {
  const paymentAmount = Number(payment.amount);
  const totalRefunded = calculateTotalRefunded(payment);
  const remainingRefundable = paymentAmount - totalRefunded;

  if (refundAmount > paymentAmount) {
    throw apiError(
      400,
      ErrorCode.INVALID_AMOUNT,
      `Refund amount (${refundAmount}) cannot exceed original payment amount (${paymentAmount})`,
    );
  }

  if (refundAmount > remainingRefundable) {
    throw apiError(
      422,
      ErrorCode.REFUND_AMOUNT_EXCEEDS_REFUNDABLE_BALANCE,
      `Refund amount (${refundAmount}) exceeds remaining refundable amount (${remainingRefundable}). Already refunded: ${totalRefunded}`,
    );
  }

  // Check if this would be a full refund
  const wouldBeFullRefund = totalRefunded + refundAmount >= paymentAmount;

  if (!isPartialRefundAllowed && !wouldBeFullRefund) {
    throw apiError(400, ErrorCode.VALIDATION_ERROR, "Only full refunds are allowed for this payment");
  }

  return {
    totalRefunded,
    remainingRefundable,
    wouldBeFullRefund,
  };
}

export async function createRefundService(params: {
  merchantId: string;
  payment_id: string;
  amount: number;
  reason?: string;
  idempotency_key?: string;
}) {
  const { merchantId, payment_id, amount, reason, idempotency_key } = params;

  // Validate amount is positive
  if (amount <= 0) {
    throw apiError(400, ErrorCode.INVALID_AMOUNT, "Refund amount must be positive");
  }

  // Use transaction to ensure atomicity of validation and creation
  const refund = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Step 1: Lock payment row and validate ownership/refundability
      // Row-level lock prevents concurrent refund race conditions
      const payment = await tx.$queryRaw<any[]>`
        SELECT p.* FROM "Payment" p
        WHERE p.id = ${payment_id} AND p."merchantId" = ${merchantId}
        FOR UPDATE
      `;

      if (!payment || payment.length === 0) {
        const paymentExists = await tx.payment.findUnique({
          where: { id: payment_id },
        });

        if (!paymentExists) {
          throw apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found");
        }
        throw apiError(403, ErrorCode.FORBIDDEN, "Payment does not belong to your merchant account");
      }

      const paymentRecord = payment[0];

      // Validate payment status is refundable
      const refundableStatuses = getRefundableStatuses();
      if (!refundableStatuses.includes(paymentRecord.status as PaymentStatus)) {
        throw apiError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `Payment cannot be refunded. Current status: ${paymentRecord.status}. Only ${refundableStatuses.join(" or ")} payments can be refunded.`,
        );
      }

      // Check if payment has expired
      if (
        paymentRecord.status === PaymentStatus.PENDING &&
        paymentRecord.expiration &&
        new Date(paymentRecord.expiration) < new Date()
      ) {
        throw apiError(400, ErrorCode.PAYMENT_EXPIRED, "Payment has expired and cannot be refunded");
      }

      // Step 2: Fetch all non-failed/non-rejected refunds for this payment
      const existingRefunds = await tx.refund.findMany({
        where: {
          paymentId: payment_id,
          status: { in: ["pending", "processing", "completed"] },
        },
      });

      // Step 3: Calculate total and validate amount
      const totalRefunded = existingRefunds.reduce((sum, ref) => sum + Number(ref.amount), 0);
      const paymentAmount = Number(paymentRecord.amount);
      const remainingRefundable = paymentAmount - totalRefunded;

      if (amount > paymentAmount) {
        throw apiError(
          422,
          ErrorCode.REFUND_AMOUNT_EXCEEDS_LIMIT,
          `Refund amount (${amount}) cannot exceed original payment amount (${paymentAmount})`,
        );
      }

      if (amount > remainingRefundable) {
        throw apiError(
          422,
          ErrorCode.REFUND_AMOUNT_EXCEEDS_LIMIT,
          `Refund amount (${amount}) exceeds remaining refundable amount (${remainingRefundable}). Already refunded: ${totalRefunded}`,
        );
      }

      // Step 4: Check for duplicate refund request (idempotency)
      if (idempotency_key) {
        const existingRefund = await tx.refund.findFirst({
          where: {
            merchantId,
            paymentId: payment_id,
            amount,
          },
        });

        if (existingRefund) {
          // Return existing refund if found
          return existingRefund;
        }
      }

      // Step 5: Create the refund
      const createdRefund = await tx.refund.create({
        data: {
          merchantId,
          paymentId: payment_id,
          amount,
          currency: paymentRecord.currency,
          reason,
          status: "pending",
        },
      });

      return createdRefund;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  return {
    message: "Refund created successfully",
    data: refund,
  };
}

export async function listRefundsService(params: {
  merchantId: string;
  page: number;
  limit: number;
  status?: RefundStatus;
  paymentId?: string;
}) {
  const { merchantId, page, limit, status, paymentId } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { merchantId };
  if (status) {
    where.status = status;
  }
  if (paymentId) {
    where.paymentId = paymentId;
  }

  const [refunds, total] = await Promise.all([
    prisma.refund.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
    }),
    prisma.refund.count({ where }),
  ]);

  return {
    message: "Refunds retrieved",
    data: {
      refunds,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    },
  };
}

export async function getRefundByIdService(merchantId: string, refundId: string) {
  const refund = await prisma.refund.findFirst({
    where: { id: refundId, merchantId },
  });
  if (!refund) {
    throw apiError(404, ErrorCode.REFUND_NOT_FOUND, "Refund not found");
  }
  return { message: "Refund retrieved", data: refund };
}

export async function updateRefundStatusService(params: {
  merchantId: string;
  refund_id: string;
  status: RefundStatus;
  failed_reason?: string;
}) {
  const { merchantId, refund_id, status, failed_reason } = params;

  const existing = await prisma.refund.findFirst({
    where: { id: refund_id, merchantId },
    include: { payment: true },
  });

  if (!existing) {
    throw apiError(404, ErrorCode.REFUND_NOT_FOUND, "Refund not found");
  }

  const updated = await prisma.refund.update({
    where: { id: refund_id },
    data: {
      status,
      failed_reason:
        status === "failed" ? (failed_reason ?? "Unknown failure") : null,
    },
  });

  if (existing.status !== status && (status === "completed" || status === "failed")) {
    const eventType: WebhookEventType =
      status === "completed" ? "refund_completed" : "refund_failed";

    await createAndDeliverWebhook(
      merchantId,
      eventType,
      {
        event_type: eventType,
        refund_id: updated.id,
        payment_id: updated.paymentId,
        amount: Number(updated.amount),
        currency: updated.currency,
        status: updated.status,
        failed_reason: updated.failed_reason,
        occurred_at: new Date().toISOString(),
      },
      updated.paymentId,
      undefined,
      // Stable id per refund+outcome, so a retried status update cannot notify
      // the merchant twice for the same terminal state (#1205).
      `${updated.id}:${eventType}`,
    );
  }

  return {
    message: "Refund status updated",
    data: updated,
  };
}
