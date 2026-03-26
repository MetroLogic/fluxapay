import {
  PrismaClient,
  RefundStatus,
  WebhookEventType,
} from "../generated/client/client";
import { createAndDeliverWebhook } from "./webhook.service";

const prisma = new PrismaClient();

export async function createRefundService(params: {
  merchantId: string;
  payment_id: string;
  amount: number;
  reason?: string;
}) {
  const { merchantId, payment_id, amount, reason } = params;

  const payment = await prisma.payment.findFirst({
    where: { id: payment_id, merchantId },
  });

  if (!payment) {
    throw { status: 404, message: "Payment not found" };
  }

  if (amount > Number(payment.amount)) {
    throw { status: 400, message: "Refund amount cannot exceed payment amount" };
  }

  const refund = await prisma.refund.create({
    data: {
      merchantId,
      paymentId: payment.id,
      amount,
      currency: payment.currency,
      reason,
      status: "pending",
    },
  });

  return {
    message: "Refund created",
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
      failed_reason: status === "failed" ? failed_reason ?? "Unknown failure" : null,
    },
  });

  if (existing.status !== status && (status === "completed" || status === "failed")) {
    const endpointUrl =
      typeof existing.payment.metadata === "object" &&
      existing.payment.metadata !== null &&
      "webhook_url" in existing.payment.metadata &&
      typeof (existing.payment.metadata as Record<string, unknown>).webhook_url === "string"
        ? ((existing.payment.metadata as Record<string, unknown>).webhook_url as string)
        : undefined;

    if (endpointUrl) {
      const eventType: WebhookEventType =
        status === "completed" ? "refund_completed" : "refund_failed";

      await createAndDeliverWebhook(
        merchantId,
        eventType,
        endpointUrl,
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
        updated.paymentId
      );
    }
  }

  return {
    message: "Refund status updated",
    data: updated,
  };
}
