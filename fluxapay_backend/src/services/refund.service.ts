import {
  PrismaClient,
  RefundStatus,
  WebhookEventType,
  Prisma,
} from "../generated/client/client";
import { createAndDeliverWebhook } from "./webhook.service";

const prisma = new PrismaClient();

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
      throw { status: 404, message: "Payment not found" };
    }
    throw {
      status: 403,
      message: "Payment does not belong to your merchant account",
    };
  }

  // Validate payment status is refundable
  const refundableStatuses = ["confirmed", "overpaid"] as const;
  if (!refundableStatuses.includes(payment.status as (typeof refundableStatuses)[number])) {
    throw {
      status: 400,
      message: `Payment cannot be refunded. Current status: ${payment.status}. Only confirmed or overpaid payments can be refunded.`,
    };
  }

  // Check if payment has expired
  if (payment.expiration && new Date(payment.expiration) < new Date()) {
    throw {
      status: 400,
      message: "Payment has expired and cannot be refunded",
    };
  }

  return payment;
}

/**
 * Calculates total refunded amount for a payment
 */
function calculateTotalRefunded(payment: any): number {
  return payment.refunds.reduce((total: number, refund: any) => {
    if (refund.status === "completed") {
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
    throw {
      status: 400,
      message: `Refund amount (${refundAmount}) cannot exceed original payment amount (${paymentAmount})`,
    };
  }

  if (refundAmount > remainingRefundable) {
    throw {
      status: 400,
      message: `Refund amount (${refundAmount}) exceeds remaining refundable amount (${remainingRefundable}). Already refunded: ${totalRefunded}`,
    };
  }

  // Check if this would be a full refund
  const wouldBeFullRefund = totalRefunded + refundAmount >= paymentAmount;

  if (!isPartialRefundAllowed && !wouldBeFullRefund) {
    throw {
      status: 400,
      message: "Only full refunds are allowed for this payment",
    };
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
    throw { status: 400, message: "Refund amount must be positive" };
  }

  // Use transaction to ensure atomicity of validation and creation
  const refund = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Step 1: Validate payment ownership and refundability
      const payment = await validatePaymentForRefund(
        payment_id,
        merchantId,
        tx,
      );

      // Step 2: Validate refund amount
      validateRefundAmount(payment, amount);

      // Step 3: Check for duplicate refund request (idempotency)
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

      // Step 4: Create the refund
      const createdRefund = await tx.refund.create({
        data: {
          merchantId,
          paymentId: payment.id,
          amount,
          currency: payment.currency,
          reason,
          status: "pending",
        },
      });

      return createdRefund;
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
}) {
  const { merchantId, page, limit, status } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { merchantId };
  if (status) {
    where.status = status;
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
    throw { status: 404, message: "Refund not found" };
  }

  const updated = await prisma.refund.update({
    where: { id: refund_id },
    data: {
      status,
      failed_reason:
        status === "failed" ? (failed_reason ?? "Unknown failure") : null,
    },
  });

  if (
    existing.status !== status &&
    (status === "completed" || status === "failed")
  ) {
    const endpointUrl =
      typeof existing.payment.metadata === "object" &&
      existing.payment.metadata !== null &&
      "webhook_url" in existing.payment.metadata &&
      typeof (existing.payment.metadata as Record<string, unknown>)
        .webhook_url === "string"
        ? ((existing.payment.metadata as Record<string, unknown>)
            .webhook_url as string)
        : undefined;

    if (endpointUrl) {
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
        endpointUrl,
      );
    }
  }

  return {
    message: "Refund status updated",
    data: updated,
  };
}
