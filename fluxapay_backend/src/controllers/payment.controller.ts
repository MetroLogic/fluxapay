import { Request, Response } from "express";
import { PrismaClient } from "../generated/client/client";
import { PaymentService } from "../services/payment.service";
import { AuthRequest } from "../types/express";

const prisma = new PrismaClient();

export const createPayment = async (req: Request, res: Response) => {
    try {
        const { order_id, amount, currency, customer_email, metadata, success_url, cancel_url } = req.body;
        const authReq = req as AuthRequest;
        const merchantId = authReq.merchantId;

        if (!merchantId) {
            return res.status(401).json({ error: "Unauthorized: Merchant ID missing" });
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
            metadata: metadata || {},
            success_url,
            cancel_url,
        });

        // Update with order_id and timeline if provided
        const updatedPayment = await prisma.payment.update({
            where: { id: payment.id },
            data: {
                order_id,
                timeline: [{ event: "payment_created", timestamp: new Date() }]
            }
        });

        res.status(201).json(updatedPayment);
    } catch (error: unknown) {
        console.error('Error creating payment:', error);
        res.status(500).json({ error: "Failed to create payment" });
    }
};

export const getPayments = async (req: Request, res: Response) => {
    try {
        const authReq = req as AuthRequest;
        const merchantId = authReq.merchantId;

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
            const header = "ID,OrderID,Amount,Currency,Status,Email,Date\n";
            const csv = payments.map((p: typeof payments[number]) =>
                `${p.id},${p.order_id || ''},${p.amount},${p.currency},${p.status},${p.customer_email},${p.createdAt}`
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
        const authReq = req as AuthRequest;
        const merchantId = authReq.merchantId;

        // Endpoint: GET /api/payments/v1/payments/:id
        // Support both 'id' and 'payment_id' parameters
        const payment_id = String(req.params.id || req.params.payment_id);

        const payment = await prisma.payment.findFirst({
            where: {
                id: payment_id,
                merchantId: merchantId
            },
            include: { merchant: true, settlement: true }
        });

        if (!payment) return res.status(404).json({ error: "Payment not found" });

        // Add explorer link if transaction_hash exists
        const explorerBase = (process.env.STELLAR_HORIZON_URL || "").includes("testnet")
            ? "https://stellar.expert/explorer/testnet/tx/"
            : "https://stellar.expert/explorer/public/tx/";

        const responseData = {
            ...payment,
            stellar_expert_url: payment.transaction_hash ? `${explorerBase}${payment.transaction_hash}` : null
        };

        res.json(responseData);
    } catch (error: unknown) {
        res.status(500).json({ error: "Error fetching details" });
    }
};


