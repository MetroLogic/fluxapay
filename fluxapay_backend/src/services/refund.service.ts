import { PrismaClient } from "../generated/client/client";
import { StellarRefundService } from "./refund.stellar.service";
import { createAndDeliverWebhook } from "./webhook.service";

const prisma = new PrismaClient();
const stellarRefundService = new StellarRefundService();

export async function initiateRefund(
  data: {
    paymentId: string;
    merchantId: string;
    amount: number;
    currency: string;
    customerAddress: string;
    reason:
    | "customer_request"
    | "duplicate_payment"
    | "failed_delivery"
    | "merchant_request"
    | "dispute_resolution";
    reasonNote?: string;
  },
  adminUserId: string,
) {
  // 1. Validate payment existence, merchant ownership and status
  const payment = await prisma.payment.findUnique({
    where: { id: data.paymentId },
  });

  if (!payment) {
    throw { status: 404, message: "Payment not found" };
  }

  if (payment.merchantId !== data.merchantId) {
    throw { status: 403, message: "Payment does not belong to this merchant" };
  }

  if (payment.status !== "confirmed") {
    throw {
      status: 400,
      message: `Only confirmed payments can be refunded. Current status: ${payment.status}`,
    };
  }

  // 2. Idempotency check: no existing non-failed refund for this payment
  const existingRefund = await prisma.refund.findFirst({
    where: {
      payment_id: data.paymentId,
      status: { not: "failed" },
    },
  });

  if (existingRefund) {
    throw {
      status: 409,
      message: "A refund for this payment is already in progress or completed",
    };
  }

  // 3. Create refund record as initiated
  const refund = await prisma.refund.create({
    data: {
      payment_id: data.paymentId,
      merchant_id: data.merchantId,
      amount: data.amount,
      currency: data.currency,
      customer_address: data.customerAddress,
      reason: data.reason,
      reason_note: data.reasonNote,
      status: "initiated",
      initiated_by: adminUserId,
    },
  });

  // 4. Update to processing
  await prisma.refund.update({
    where: { id: refund.id },
    data: { status: "processing" },
  });

  try {
    // 5. Execute on-chain refund
    const result = await stellarRefundService.executeRefund({
      refundId: refund.id,
      merchantId: data.merchantId,
      paymentId: data.paymentId,
      customerAddress: data.customerAddress,
      amount: data.amount.toString(),
      currency: data.currency,
    });

    // 6. Update to completed
    const completedRefund = await prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: "completed",
        stellar_tx_hash: result.transactionHash,
      },
    });

    // 7. Trigger success webhook
    await createAndDeliverWebhook(
      data.merchantId,
      "refund_completed",
      {
        refund_id: completedRefund.id,
        payment_id: data.paymentId,
        amount: data.amount,
        currency: data.currency,
        status: "completed",
        stellar_tx_hash: result.transactionHash,
      },
      data.paymentId,
    );

    return { message: "Refund completed successfully", refund: completedRefund };
  } catch (err: any) {
    // 8. Update to failed
    const failedRefund = await prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: "failed",
        error_message: err.message || "Unknown error",
        error_code: err.code || "unknown",
      },
    });

    // 9. Trigger failure webhook
    await createAndDeliverWebhook(
      data.merchantId,
      "refund_failed",
      {
        refund_id: refund.id,
        payment_id: data.paymentId,
        amount: data.amount,
        currency: data.currency,
        status: "failed",
        error_message: err.message || "Unknown error",
      },
      data.paymentId,
    );

    throw {
      status: err.status || 502,
      message: err.message || "Refund failed due to Stellar network error",
      refund: failedRefund,
    };
  }
}

export async function getRefund(refundId: string) {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
  });

  if (!refund) {
    throw { status: 404, message: "Refund not found" };
  }

  return { message: "Refund retrieved", refund };
}

export async function listRefunds(filters: {
  paymentId?: string;
  merchantId?: string;
  status?: "initiated" | "processing" | "completed" | "failed";
  page: number;
  limit: number;
}) {
  const { paymentId, merchantId, status, page, limit } = filters;

  const where: Record<string, any> = {};
  if (paymentId) where.payment_id = paymentId;
  if (merchantId) where.merchant_id = merchantId;
  if (status) where.status = status;

  const [refunds, total] = await Promise.all([
    prisma.refund.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: "desc" },
    }),
    prisma.refund.count({ where }),
  ]);

  return {
    message: "Refunds retrieved",
    refunds,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
