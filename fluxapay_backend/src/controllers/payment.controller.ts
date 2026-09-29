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

    return res.json({ data, meta: { total, page, limit } });
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

      if (isTerminalStatus(updatedPayment.status as PaymentStatus)) {
        res.write(`data: ${JSON.stringify({ event: "done" })}\n\n`);
        eventBus.off(AppEvents.PAYMENT_UPDATED, onPaymentUpdate);
        res.end();
      }
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

export const updatePayment = async (req: Request, res: Response) => {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    if (!merchantId) {
      return sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }

    const paymentId = String(req.params.id);
    const { note } = req.body;

    const updated = await PaymentService.updatePayment(paymentId, merchantId, { note });
    return res.json(updated);
  } catch (error: unknown) {
    return sendApiError(res, error);
  }
};

