import { Request, Response } from "express";
import { PrismaClient } from "../generated/client/client";
import { PaymentService } from "../services/payment.service";
import { normalizeCheckoutAccentHex } from "../utils/checkout-branding.util";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";
import { MetadataValidationError } from "../utils/metadata.util";

const prisma = new PrismaClient();

export const createPayment = async (req: Request, res: Response) => {
    try {
        const { order_id, amount, currency, customer_email, description, metadata, success_url, cancel_url, customer_id } = req.body;
        const authReq = req as AuthRequest;
        const merchantId = authReq.merchantId;

        if (!merchantId) {
            return res.status(401).json({ error: "Unauthorized: Merchant ID missing" });
        }

        let linkedCustomerId: string | undefined;
        if (customer_id !== undefined && customer_id !== null && customer_id !== "") {
            const cid = String(customer_id).trim();
            const customer = await prisma.customer.findFirst({
                where: { id: cid, merchantId },
                select: { id: true },
            });
            if (!customer) {
                return res.status(400).json({ error: "Invalid customer_id for this merchant" });
            }
            linkedCustomerId = customer.id;
        }

        const isWithinRateLimit = await PaymentService.checkRateLimit(merchantId);
        if (!isWithinRateLimit) {
            const retryAfterSeconds = PaymentService.getRateLimitWindowSeconds();
            res.setHeader("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
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

        res.status(201).json({
            ...payment,
            checkout_url: payment.checkout_url,
        });
    } catch (error: unknown) {
        if (error instanceof MetadataValidationError) {
            return res.status(400).json({ error: error.message });
        }

        if (
            error &&
            typeof error === "object" &&
            "status" in error &&
            (error as { status?: unknown }).status === 400
        ) {
            const message =
                "message" in error && typeof (error as { message?: unknown }).message === "string"
                    ? (error as { message: string }).message
                    : "Validation failed";
            return res.status(400).json({ error: message });
        }

        console.error('Error creating payment:', error);
        res.status(500).json({ error: "Failed to create payment" });
    }
};

export const getPayments = async (req: Request, res: Response) => {
    try {
        const merchantId = await validateUserId(req as AuthRequest);

        // 1. Destructure with explicit type casting immediately
        const query = req.query as Record<string, unknown>;

        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 10;

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

        // Export Logic
        if (req.path.includes('/export')) {
            const payments = await prisma.payment.findMany({
                where,
                orderBy: { [sortBy]: sortOrder }
            });
            const header = "ID,MerchantID,Amount,Currency,Status,Email,Date\n";
            const csv = payments.map((p: typeof payments[number]) =>
                `${p.id},${p.merchantId},${p.amount},${p.currency},${p.status},${p.customer_email},${p.createdAt}`
            ).join("\n");
            res.setHeader("Content-Type", "text/csv");
            res.attachment("payments_history.csv");
            return res.status(200).send(header + csv);
        }

        // List Logic
        const [data, total] = await Promise.all([
            prisma.payment.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { [sortBy]: sortOrder } // This is line 106/107 - now using strictly typed sortOrder
            }),
            prisma.payment.count({ where })
        ]);

        res.json({ data, meta: { total, page, limit } });
    } catch (error: unknown) {
        res.status(500).json({ error: "Internal Server Error" });
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
                merchantId: merchantId
            },
            include: { merchant: true }
        });

        if (!payment) return res.status(404).json({ error: "Payment not found" });

        // Add explorer link if transaction_hash exists (not present in current Payment model).
        const explorerBase = (process.env.STELLAR_HORIZON_URL || "").includes("testnet")
            ? "https://stellar.expert/explorer/testnet/tx/"
            : "https://stellar.expert/explorer/public/tx/";

        const responseData = {
            ...payment,
            stellar_expert_url: null
        };

        res.json(responseData);
    } catch (error: unknown) {
        if (
            error &&
            typeof error === "object" &&
            "status" in error &&
            typeof (error as { status?: unknown }).status === "number"
        ) {
            const status = (error as { status: number }).status;
            const message =
                "message" in error && typeof (error as { message?: unknown }).message === "string"
                    ? (error as { message: string }).message
                    : "Unauthorized";
            return res.status(status).json({ error: message });
        }
        res.status(500).json({ error: "Error fetching details" });
    }
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
            return res.status(404).json({ error: "Payment not found" });
        }

        const accent = normalizeCheckoutAccentHex(
            payment.merchant.checkout_accent_color,
        );

        const meta = memoFromMetadata(payment.metadata);
        res.json({
            id: payment.id,
            amount: Number(payment.amount),
            currency: payment.currency,
            address: payment.stellar_address,
            expiresAt: payment.expiration.toISOString(),
            status: payment.status,
            successUrl: payment.success_url ?? undefined,
            cancelUrl: payment.cancel_url ?? undefined,
            merchantName: payment.merchant.business_name,
            description: payment.description ?? undefined,
            checkoutLogoUrl: payment.merchant.checkout_logo_url ?? undefined,
            checkoutAccentColor: accent ?? undefined,
            ...meta,
        });
    } catch (error: unknown) {
        console.error("getPublicCheckoutPayment", error);
        res.status(500).json({ error: "Failed to load payment" });
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
            return res.status(404).json({ error: "Payment not found" });
        }
        res.json({ status: payment.status });
    } catch (error: unknown) {
        console.error("getPublicCheckoutPaymentStatus", error);
        res.status(500).json({ error: "Failed to load status" });
    }
};

