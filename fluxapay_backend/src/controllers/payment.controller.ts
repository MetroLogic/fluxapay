import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import { PrismaClient } from "../generated/client/client";
import { PaymentService } from "../services/payment.service";
import { normalizeCheckoutAccentHex } from "../utils/checkout-branding.util";
import { AuthRequest } from "../types/express";
import { eventBus, AppEvents } from "../services/EventService";
import { validateUserId } from "../helpers/request.helper";
import { MetadataValidationError } from "../utils/metadata.util";
import { paymentSettlementService } from "../services/paymentSettlement.service";
import { IdempotentRequest, storeIdempotentResponse } from "../middleware/idempotency.middleware";


const prisma = new PrismaClient();

export const createPayment = async (req: Request, res: Response) => {
  try {
    const {
      order_id,
      amount,
      currency,
      customer_email,
      description,
      metadata,
      success_url,
      cancel_url,
      customer_id,
    } = req.body;
    const authReq = req as AuthRequest;
    const merchantId = authReq.merchantId;

    if (!merchantId) {
      return sendApiError(
        res,
        apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized: Merchant ID missing"),
      );
    }

    let linkedCustomerId: string | undefined;
    if (
      customer_id !== undefined &&
      customer_id !== null &&
      customer_id !== ""
    ) {
      const cid = String(customer_id).trim();
      const customer = await prisma.customer.findFirst({
        where: { id: cid, merchantId },
        select: { id: true },
      });
      if (!customer) {
        return sendApiError(
          res,
          apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid customer_id for this merchant"),
        );
      }
      linkedCustomerId = customer.id;
    }

    const isWithinRateLimit = await PaymentService.checkRateLimit(merchantId);
    if (!isWithinRateLimit) {
      const retryAfterSeconds = PaymentService.getRateLimitWindowSeconds();
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return sendApiError(
        res,
        apiError(429, ErrorCode.PAYMENT_RATE_LIMIT, "Rate limit exceeded. Please try again later.", {
          retryAfterSeconds,
        }),
      );
    }

    // Use PaymentService to create payment with derived Stellar address
    const payment = await PaymentService.createPayment({
      merchantId,
      amount,
      currency,
      customer_email,
      description,
      metadata: metadata || {},
      success_url,
      cancel_url,
      customerId: linkedCustomerId,
    });

    const responseBody = {
      ...payment,
      checkout_url: payment.checkout_url,
    };

    const idempotentReq = req as IdempotentRequest;
    if (idempotentReq.idempotencyKey) {
      await storeIdempotentResponse(
        idempotentReq.idempotencyKey,
        req.body,
        201,
        responseBody,
        merchantId
      );
    }

    res.status(201).json(responseBody);
  } catch (error: unknown) {
    if (error instanceof MetadataValidationError) {
      return sendApiError(
        res,
        apiError(400, ErrorCode.INVALID_METADATA, error.message),
      );
    }

    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status?: unknown }).status === 400
    ) {
      return sendApiError(res, error);
    }

    console.error("Error creating payment:", error);
    return sendApiError(
      res,
      apiError(500, ErrorCode.PAYMENT_CREATE_FAILED, "Failed to create payment"),
    );
  }
};

export const getPayments = async (req: Request, res: Response) => {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    if (!merchantId) {
      return sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }

    const query = req.query as Record<string, unknown>;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const status = query.status ? String(query.status) : undefined;
    const currency = query.currency ? String(query.currency) : undefined;
    const search = query.search ? String(query.search) : undefined;
    const date_from = query.date_from ? String(query.date_from) : undefined;
    const date_to = query.date_to ? String(query.date_to) : undefined;
    const sortBy =
      typeof query.sort_by === "string" ? query.sort_by : "createdAt";
    const sortOrder: "asc" | "desc" = query.order === "asc" ? "asc" : "desc";

    const where: Record<string, unknown> = {
      merchantId,
      ...(status && { status }),
      ...(currency && { currency }),
      ...((date_from || date_to) && {
        createdAt: {
          ...(date_from && { gte: new Date(date_from) }),
          ...(date_to && { lte: new Date(date_to) }),
        },
      }),
      ...(search && {
        OR: [
          { id: { contains: search } },
          { order_id: { contains: search } },
          { customer_email: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.payment.count({ where }),
    ]);

    return res.json({ data, meta: { total, page, limit } });
  } catch (error: unknown) {
    return sendApiError(res, error);
  }
};

export const exportPayments = async (req: Request, res: Response) => {
    try {
        const merchantId = await validateUserId(req as AuthRequest);
        if (!merchantId) {
            return sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized"));
        }

        // 1. Destructure with explicit type casting immediately
        const query = req.query as Record<string, unknown>;

        // Force these to be strings or undefined (No arrays allowed!)
        const status = query.status ? String(query.status) : undefined;
        const currency = query.currency ? String(query.currency) : undefined;
        const search = query.search ? String(query.search) : undefined;
        const date_from = query.date_from ? String(query.date_from) : undefined;
        const date_to = query.date_to ? String(query.date_to) : undefined;

        // 2. We use a constant for Sort/Order to satisfy the Prisma type engine
        const sortBy = typeof query.sort_by === 'string' ? query.sort_by : 'createdAt';
        const sortOrder: 'asc' | 'desc' = query.order === 'asc' ? 'asc' : 'desc';

        const where: Record<string, unknown> = {
            merchantId: merchantId,
            ...(status && { status }),
            ...(currency && { currency }),
            ...((date_from || date_to) && {
                createdAt: {
                    ...(date_from && { gte: new Date(date_from) }),
                    ...(date_to && { lte: new Date(date_to) }),
                }
            }),
            ...(search && {
                OR: [
                    { id: { contains: search } },
                    { order_id: { contains: search } },
                    { customer_email: { contains: search, mode: 'insensitive' } }
                ]
            })
        };

        const payments = await prisma.payment.findMany({
            where,
            orderBy: { [sortBy]: sortOrder }
        });

        // CSV escaping: wrap fields containing comma or newline in quotes
        const escapeCsv = (field: string | null | undefined) => {
            if (!field) return '';
            const str = String(field);
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const header = "ID,MerchantID,Amount,Currency,Status,Email,Date\n";
        const csv = payments.map((p) =>
            `${escapeCsv(p.id)},${escapeCsv(p.merchantId)},${escapeCsv(p.amount.toString())},${escapeCsv(p.currency)},${escapeCsv(p.status)},${escapeCsv(p.customer_email)},${escapeCsv(p.createdAt.toISOString())}`
        ).join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.attachment("payments_history.csv");
        return res.status(200).send(header + csv);
    } catch (error: unknown) {
        return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Internal Server Error"));
    }
};

export const getPaymentById = async (req: Request, res: Response) => {
  try {
    const merchantId = await validateUserId(req as AuthRequest);

    // Endpoint: GET /api/payments/v1/payments/:id
    // Support both 'id' and 'payment_id' parameters
    const payment_id = String(req.params.id || req.params.payment_id);

    const payment = await prisma.payment.findFirst({
      where: {
        id: payment_id,
        merchantId: merchantId,
      },
      include: { merchant: true },
    });

    if (!payment) {
      return sendApiError(res, apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found"));
    }

    // Add explorer link if transaction_hash exists (not present in current Payment model).
    const explorerBase = (process.env.STELLAR_HORIZON_URL || "").includes(
      "testnet",
    )
      ? "https://stellar.expert/explorer/testnet/tx/"
      : "https://stellar.expert/explorer/public/tx/";

    const responseData = {
      ...payment,
      stellar_expert_url: null,
    };

    res.json(responseData);
  } catch (error: unknown) {
    return sendApiError(res, error);
  }
};

/**
 * GET /api/payments/:id/status
 * Publicly accessible view of a payment's status.
 *
 * Safe payer DTO — only the fields a payer needs to complete or verify a
 * checkout.  Intentionally excludes: merchantId, internal DB ids beyond the
 * payment id, merchant API keys, customer PII, and any internal metadata.
 */
export const getPaymentStatus = async (req: Request, res: Response) => {
  try {
    const payment_id = String(req.params.id);

    const payment = await prisma.payment.findUnique({
      where: { id: payment_id },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        stellar_address: true,
        expiration: true,
      },
    });

    if (!payment) {
      return sendApiError(res, apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found"));
    }

    // Return a minimal, PII-free DTO safe for unauthenticated callers.
    res.json({
      id: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      address: payment.stellar_address,
      expiresAt: payment.expiration.toISOString(),
    });
  } catch (error: unknown) {
    console.error("Error fetching payment status:", error);
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Internal Server Error"));
  }
};

/**
 * GET /api/payments/:id/stream
 * SSE stream for real-time payment updates.
 */
export const streamPaymentStatus = async (req: Request, res: Response) => {
  const payment_id = String(req.params.id);

  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial status
  const payment = await prisma.payment.findUnique({
    where: { id: payment_id },
    select: { status: true },
  });

  if (payment) {
    res.write(`data: ${JSON.stringify({ status: payment.status })}\n\n`);
  }

  // Listener for payment updates
  const onPaymentUpdate = (updatedPayment: any) => {
    if (updatedPayment.id === payment_id) {
      res.write(
        `data: ${JSON.stringify({ status: updatedPayment.status })}\n\n`,
      );

      // If terminal status reached, we could potentially close the stream
      // but usually let the client handle it.
    }
  };

  eventBus.on(AppEvents.PAYMENT_UPDATED, onPaymentUpdate);

  // Clean up on client disconnect
  req.on("close", () => {
    eventBus.off(AppEvents.PAYMENT_UPDATED, onPaymentUpdate);
    res.end();
  });
};

function memoFromMetadata(metadata: unknown): {
  memo?: string;
  memoType?: "text" | "id" | "hash" | "return";
  memoRequired?: boolean;
} {
  if (!metadata || typeof metadata !== "object") return {};
  const m = metadata as Record<string, unknown>;
  const memo = typeof m.memo === "string" ? m.memo : undefined;
  const mt = m.memo_type ?? m.memoType;
  const memoType =
    mt === "text" || mt === "id" || mt === "hash" || mt === "return"
      ? mt
      : undefined;
  const memoRequired = Boolean(m.memoRequired ?? m.memo_required);
  return { memo, memoType, memoRequired };
}

/**
 * Public Checkout DTO
 *
 * Strict whitelist of fields safe to expose to unauthenticated payers.
 * Fields intentionally absent: merchantId, customerId, customer_email,
 * merchant API keys, internal DB indices, encrypted_key_data, metadata (raw),
 * payment_index, derivation_path, order_id.
 */
export interface PublicCheckoutDto {
  id: string;
  amount: number;
  currency: string;
  address: string;
  expiresAt: string;
  status: string;
  successUrl?: string;
  cancelUrl?: string;
  merchantName: string;
  description?: string;
  checkoutLogoUrl?: string;
  checkoutAccentColor?: string;
  memo?: string;
  memoType?: "text" | "id" | "hash" | "return";
  memoRequired?: boolean;
}

/**
 * Build the public checkout DTO from a hydrated payment + merchant record.
 * Centralising DTO construction here ensures the whitelist is enforced in a
 * single place and is easily testable.
 */
export function buildPublicCheckoutDto(payment: {
  id: string;
  amount: { toString(): string } | number;
  currency: string;
  stellar_address: string;
  expiration: Date;
  status: string;
  success_url: string | null;
  cancel_url: string | null;
  description: string | null;
  metadata: unknown;
  merchant: {
    business_name: string;
    checkout_logo_url: string | null;
    checkout_accent_color: string | null;
  };
}): PublicCheckoutDto {
  const accent = normalizeCheckoutAccentHex(
    payment.merchant.checkout_accent_color,
  );
  const meta = memoFromMetadata(payment.metadata);

  const dto: PublicCheckoutDto = {
    id: payment.id,
    amount: Number(payment.amount),
    currency: payment.currency,
    address: payment.stellar_address,
    expiresAt: payment.expiration.toISOString(),
    status: payment.status,
    merchantName: payment.merchant.business_name,
  };

  if (payment.success_url != null) dto.successUrl = payment.success_url;
  if (payment.cancel_url != null) dto.cancelUrl = payment.cancel_url;
  if (payment.description != null) dto.description = payment.description;
  if (payment.merchant.checkout_logo_url != null)
    dto.checkoutLogoUrl = payment.merchant.checkout_logo_url;
  if (accent != null) dto.checkoutAccentColor = accent;
  if (meta.memo !== undefined) dto.memo = meta.memo;
  if (meta.memoType !== undefined) dto.memoType = meta.memoType;
  if (meta.memoRequired !== undefined) dto.memoRequired = meta.memoRequired;

  return dto;
}

/** Public hosted checkout — no auth. */
export const getPublicCheckoutPayment = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        merchant: {
          select: {
            business_name: true,
            checkout_logo_url: true,
            checkout_accent_color: true,
          },
        },
      },
    });

    if (!payment?.stellar_address) {
      return sendApiError(res, apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found"));
    }

    res.json(buildPublicCheckoutDto(payment as any));
  } catch (error: unknown) {
    console.error("getPublicCheckoutPayment", error);
    return sendApiError(res, apiError(500, ErrorCode.PAYMENT_FETCH_FAILED, "Failed to load payment"));
  }
};

export const getPublicCheckoutPaymentStatus = async (
  req: Request,
  res: Response,
) => {
  try {
    const id = String(req.params.id);
    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!payment) {
      return sendApiError(res, apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found"));
    }
    res.json({ status: payment.status });
  } catch (error: unknown) {
    console.error("getPublicCheckoutPaymentStatus", error);
    return sendApiError(res, apiError(500, ErrorCode.PAYMENT_FETCH_FAILED, "Failed to load status"));
  }
};

/**
 * GET /api/v1/charges/{id}/settlement
 * Get settlement details for a specific payment.
 */
export const getPaymentSettlement = async (req: Request, res: Response) => {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const paymentId = String(req.params.id);

    const settlement = await paymentSettlementService.getPaymentSettlement(
      paymentId,
      merchantId,
    );

    res.json(settlement);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Payment not found") {
      return sendApiError(res, apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found"));
    }
    console.error("Error fetching payment settlement:", error);
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Internal Server Error"));
  }
};

/**
 * GET /api/v1/admin/payments
 * Query payments across all merchants (Admin only).
 */
export const getAdminPayments = async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, unknown>;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const status = query.status ? String(query.status) : undefined;
    const currency = query.currency ? String(query.currency) : undefined;
    const search = query.search ? String(query.search) : undefined;
    const date_from = query.date_from ? String(query.date_from) : undefined;
    const date_to = query.date_to ? String(query.date_to) : undefined;
    const sortBy =
      typeof query.sort_by === "string" ? query.sort_by : "createdAt";
    const sortOrder: "asc" | "desc" = query.order === "asc" ? "asc" : "desc";

    const where: Record<string, unknown> = {
      ...(status && status !== "all" && { status }),
      ...(currency && { currency }),
      ...((date_from || date_to) && {
        createdAt: {
          ...(date_from && { gte: new Date(date_from) }),
          ...(date_to && { lte: new Date(date_to) }),
        },
      }),
      ...(search && {
        OR: [
          { id: { contains: search } },
          { order_id: { contains: search } },
          { customer_email: { contains: search, mode: "insensitive" } },
          { merchant: { business_name: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where: where as any,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          merchant: {
            select: {
              id: true,
              business_name: true,
              email: true,
            },
          },
        },
      }),
      prisma.payment.count({ where: where as any }),
    ]);

    return res.json({ data, meta: { total, page, limit } });
  } catch (error: unknown) {
    console.error("Error in getAdminPayments:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

