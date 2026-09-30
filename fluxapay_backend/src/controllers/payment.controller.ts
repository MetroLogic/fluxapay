import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import { PrismaClient } from "../generated/client/client";
import { prisma } from "../config/prisma";
import { PaymentService } from "../services/payment.service";
import { normalizeCheckoutAccentHex } from "../utils/checkout-branding.util";
import { AuthRequest } from "../types/express";
import { eventBus, AppEvents } from "../services/EventService";
import { validateUserId } from "../helpers/request.helper";
import { MetadataValidationError } from "../utils/metadata.util";
import { paymentSettlementService } from "../services/paymentSettlement.service";
import { IdempotentRequest, storeIdempotentResponse } from "../middleware/idempotency.middleware";
import { isTerminalStatus, PaymentStatus } from "../types/payment";
import { assertValidPositiveAmount, AmountValidationError } from "../utils/amount.util";
import { mapStellarError, StellarErrorMapping } from "../utils/stellar-error.util";

/**
 * Columns the payments list endpoint is allowed to sort by. Anything else forces
 * Postgres to sort the merchant's entire payment set in memory, which is the
 * other half of the slow-list problem alongside missing indexes (#1208).
 */
const PAYMENT_LIST_SORT_COLUMNS = new Set([
  "createdAt",
  "amount",
  "status",
  "currency",
  "confirmed_at",
  "settled_at",
]);

/** Upper bound on rows returned per page for the payments list endpoint. */
const PAYMENT_LIST_MAX_LIMIT = 100;

/**
 * Clamp `?limit` so a single request cannot ask the database to materialise an
 * unbounded number of rows for a merchant with a large payment history (#1208).
 */
function resolvePageSize(rawLimit: unknown): number {
  const requested = Number(rawLimit);
  if (!Number.isFinite(requested) || requested <= 0) return 10;
  return Math.min(Math.floor(requested), PAYMENT_LIST_MAX_LIMIT);
}

/** Resolve `?page` to a non-negative integer offset multiplier. */
function resolvePage(rawPage: unknown): number {
  const requested = Number(rawPage);
  if (!Number.isFinite(requested) || requested <= 0) return 1;
  return Math.floor(requested);
}

/** Resolve `?sort_by` against the allow-list, falling back to createdAt. */
function resolveSortColumn(rawSortBy: unknown): string {
  return typeof rawSortBy === "string" && PAYMENT_LIST_SORT_COLUMNS.has(rawSortBy)
    ? rawSortBy
    : "createdAt";
}


export const createPayment = async (req: Request, res: Response) => {
  try {
    const {
      order_id,
      amount,
      currency,
      customer_email,
      description,
      note,
      metadata,
      success_url,
      cancel_url,
      customer_id,
      expires_in_seconds,
    } = req.body;
    const authReq = req as AuthRequest;
    const merchantId = authReq.merchantId;

    if (!merchantId) {
      return sendApiError(
        res,
        apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized: Merchant ID missing"),
      );
    }

    try {
      assertValidPositiveAmount(amount, "amount");
    } catch (validationError) {
      if (validationError instanceof AmountValidationError) {
        return sendApiError(
          res,
          apiError(400, ErrorCode.INVALID_AMOUNT, validationError.message),
        );
      }
      throw validationError;
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
      note,
      metadata: metadata || {},
      success_url,
      cancel_url,
      customerId: linkedCustomerId,
      expires_in_seconds:
        expires_in_seconds !== undefined ? Number(expires_in_seconds) : undefined,
      isTestMode: authReq.isTestMode,
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
      typeof (error as { status?: unknown }).status === "number"
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
    const isTestMode = (req as AuthRequest).isTestMode;

    const query = req.query as Record<string, unknown>;
    const page = resolvePage(query.page);
    const limit = resolvePageSize(query.limit);
    const status = query.status ? String(query.status) : undefined;
    const currency = query.currency ? String(query.currency) : undefined;
    const search = query.search ? String(query.search) : undefined;
    const date_from = query.date_from ? String(query.date_from) : undefined;
    const date_to = query.date_to ? String(query.date_to) : undefined;
    const sortBy = resolveSortColumn(query.sort_by);
    const sortOrder: "asc" | "desc" = query.order === "asc" ? "asc" : "desc";

    const where: Record<string, unknown> = {
      merchantId,
      // Partition live vs test-mode payments. JWT (dashboard) requests see both.
      ...(typeof isTestMode === "boolean" && { is_test_mode: isTestMode }),
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

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return res.json({
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
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
        const isTestMode = (req as AuthRequest).isTestMode;

        // 1. Destructure with explicit type casting immediately
        const query = req.query as Record<string, unknown>;

        // Force these to be strings or undefined (No arrays allowed!)
        const status = query.status ? String(query.status) : undefined;
        const currency = query.currency ? String(query.currency) : undefined;
        const search = query.search ? String(query.search) : undefined;
        const date_from = query.date_from ? String(query.date_from) : undefined;
        const date_to = query.date_to ? String(query.date_to) : undefined;

        // 2. We use an allow-listed constant for Sort/Order so an arbitrary
        // column name can never force a full sort of the merchant's payments.
        const sortBy = resolveSortColumn(query.sort_by);
        const sortOrder: 'asc' | 'desc' = query.order === 'asc' ? 'asc' : 'desc';

        const where: Record<string, unknown> = {
            merchantId: merchantId,
            // Partition live vs test-mode payments (test payments never appear in live exports).
            ...(typeof isTestMode === "boolean" && { is_test_mode: isTestMode }),
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
    const isTestMode = (req as AuthRequest).isTestMode;

    const payment = await prisma.payment.findFirst({
      where: {
        id: payment_id,
        merchantId: merchantId,
        // Test keys can only read test payments; live keys can only read live payments.
        ...(typeof isTestMode === "boolean" && { is_test_mode: isTestMode }),
      },
      include: { merchant: true },
    });

    if (!payment) {
      return sendApiError(res, apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found"));
    }

    return res.json(payment);
  } catch (error: unknown) {
    return sendApiError(res, error);
  }
};

export const getCheckoutSession = async (req: Request, res: Response) => {
  try {
    const payment_id = String(req.params.id || req.params.payment_id);

    const payment = await prisma.payment.findFirst({
      where: { id: payment_id },
      include: { merchant: true },
    });

    if (!payment) {
      return sendApiError(res, apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found"));
    }

    const accentHex = normalizeCheckoutAccentHex(payment.merchant?.checkout_accent_hex);

    return res.json({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      description: payment.description,
      customer_email: payment.customer_email,
      success_url: payment.success_url,
      cancel_url: payment.cancel_url,
      expires_at: payment.expires_at,
      merchant_name: payment.merchant?.name,
      accent_hex: accentHex,
      // The checkout page uses this to decide whether to show the
      // "processing" loading spinner while the payment is being confirmed.
      is_processing: payment.status === PaymentStatus.PROCESSING,
      is_terminal: isTerminalStatus(payment.status),
    });
  } catch (error: unknown) {
    return sendApiError(res, error);
  }
};

export const confirmPayment = async (req: Request, res: Response) => {
  try {
    const payment_id = String(req.params.id || req.params.payment_id);
    const { tx_hash } = req.body;

    const payment = await prisma.payment.findFirst({
      where: { id: payment_id },
    });

    if (!payment) {
      return sendApiError(res, apiError(404, ErrorCode.PAYMENT_NOT_FOUND, "Payment not found"));
    }

    if (isTerminalStatus(payment.status)) {
      return res.json({ status: payment.status });
    }

    try {
      await paymentSettlementService.confirmPayment(payment_id, tx_hash);
    } catch (stellarError) {
      const mapped = mapStellarError(stellarError);
      return sendApiError(res, mapped);
    }

    eventBus.emit(AppEvents.PAYMENT_CONFIRMED, { paymentId: payment_id });

    return res.json({ status: PaymentStatus.CONFIRMED });
  } catch (error: unknown) {
    return sendApiError(res, error);
  }
};
