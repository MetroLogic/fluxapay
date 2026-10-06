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
import {
    buildPaymentExportFilename,
    ExportClientDisconnectedError,
    InvalidExportDateError,
    parseAmountBound,
    parseExportDateBound,
    streamPaymentsCsv,
} from "../services/paymentCsvExport.service";
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
    const authReq = req as AuthRequest;

    let merchantId: string | undefined;
    try {
        merchantId = await validateUserId(authReq);
    } catch {
        merchantId = undefined;
    }
    if (!merchantId) {
        return sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }

    const isTestMode = authReq.isTestMode;
    const query = req.query as Record<string, unknown>;

    const readParam = (name: string): string | undefined => {
        const raw = query[name];
        if (raw === undefined || raw === null) return undefined;
        const value = String(raw).trim();
        return value === "" ? undefined : value;
    };

    // Date range is the primary export filter (#1216). A bare YYYY-MM-DD bound
    // for date_to is expanded to the end of that day so the last day of the
    // selected range is never silently dropped.
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;
    try {
        dateFrom = parseExportDateBound(readParam("date_from"), "from");
        dateTo = parseExportDateBound(readParam("date_to"), "to");
    } catch (error) {
        if (error instanceof InvalidExportDateError) {
            return sendApiError(
                res,
                apiError(400, ErrorCode.VALIDATION_ERROR, error.message),
            );
        }
        return sendApiError(
            res,
            apiError(400, ErrorCode.VALIDATION_ERROR, "Invalid export filters"),
        );
    }

    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
        return sendApiError(
            res,
            apiError(
                400,
                ErrorCode.VALIDATION_ERROR,
                "date_from must be earlier than or equal to date_to",
            ),
        );
    }

    const filename = buildPaymentExportFilename();

    try {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.attachment(filename);

        await streamPaymentsCsv({
            filters: {
                merchantId,
                isTestMode,
                status: readParam("status"),
                currency: readParam("currency"),
                search: readParam("search"),
                amountMin: parseAmountBound(readParam("amount_min")),
                amountMax: parseAmountBound(readParam("amount_max")),
                dateFrom,
                dateTo,
            },
            sink: res,
            // Runs after the pre-flight count but before the first byte is
            // written, which is the only window where extra headers still land.
            onStart: (totalMatched, truncated) => {
                res.setHeader("X-Export-Row-Count", String(totalMatched));
                if (truncated) {
                    res.setHeader("X-Export-Truncated", "true");
                }
            },
        });
        return;
    } catch (error) {
        if (error instanceof ExportClientDisconnectedError) {
            // The browser aborted the download (navigation, tab close). Nothing
            // to report and nothing left to clean up.
            return;
        }
        console.error("Error exporting payments CSV:", error);
        if (!res.headersSent) {
            return sendApiError(
                res,
                apiError(500, ErrorCode.INTERNAL_ERROR, "Internal Server Error"),
            );
        }
        // Headers are already on the wire, so the only honest signal left is
        // to terminate the response rather than pad it with a valid-looking row.
        return res.end();
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

 main
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

 main
    }

    eventBus.emit(AppEvents.PAYMENT_CONFIRMED, { paymentId: payment_id });

    return res.json({ status: PaymentStatus.CONFIRMED });
  } catch (error: unknown) {
    return sendApiError(res, error);
  }
};
