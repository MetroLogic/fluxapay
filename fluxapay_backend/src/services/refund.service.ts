import { PrismaClient } from "../generated/client/client";
import { StellarRefundService } from "./refund.stellar.service";

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
  // Idempotency check: no existing non-failed refund for this payment
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

  // Create refund record as initiated
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

  // Update to processing
  await prisma.refund.update({
    where: { id: refund.id },
    data: { status: "processing" },
  });

  try {
    // Execute on-chain refund
    const result = await stellarRefundService.executeRefund({
      refundId: refund.id,
      merchantId: data.merchantId,
      paymentId: data.paymentId,
      customerAddress: data.customerAddress,
      amount: data.amount.toString(),
      currency: data.currency,
    });

    // Update to completed
    const completedRefund = await prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: "completed",
        stellar_tx_hash: result.transactionHash,
      },
    });

    return { message: "Refund completed successfully", refund: completedRefund };
  } catch (err: any) {
    // Update to failed
    const failedRefund = await prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: "failed",
        error_message: err.message || "Unknown error",
        error_code: err.code || "unknown",
      },
    });

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
