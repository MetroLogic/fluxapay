import { Request, Response } from "express";
import { PrismaClient } from "../generated/client/client";

const prisma = new PrismaClient();

export const createPayment = async (req: Request, res: Response) => {
  try {
    const { merchantId, order_id, amount, currency, customer_email, metadata } = req.body;
    const payment = await prisma.payment.create({
      data: {
        merchantId,
        order_id,
        amount,
        currency,
        customer_email,
        metadata: metadata || {},
        status: "pending",
        expiration: new Date(Date.now() + 3600000), // 1 hour expiry
        timeline: [{ event: "payment_created", timestamp: new Date() }]
      }
    });
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: "Failed to create payment" });
  }
};

export const getPayments = async (req: Request, res: Response) => {
  try {
    const {
      page = 1, limit = 10, status, currency,
      date_from, date_to, amount_min, amount_max,
      search, sort_by = 'createdAt', order = 'desc'
    } = req.query;

    const where: any = {
      ...(status && { status: String(status) }),
      ...(currency && { currency: String(currency) }),
      ...((date_from || date_to) && {
        createdAt: {
          ...(date_from && { gte: new Date(String(date_from)) }),
          ...(date_to && { lte: new Date(String(date_to)) }),
        }
      }),
      ...((amount_min || amount_max) && {
        amount: {
          ...(amount_min && { gte: Number(amount_min) }),
          ...(amount_max && { lte: Number(amount_max) }),
        }
      }),
      ...(search && {
        OR: [
          { id: { contains: String(search) } },
          { order_id: { contains: String(search) } },
          { customer_email: { contains: String(search), mode: 'insensitive' } }
        ]
      })
    };

    // CSV Export Handling
    if (req.path.includes('/export')) {
      const payments = await prisma.payment.findMany({ where, orderBy: { [String(sort_by)]: order as any } });
      const header = "ID,OrderID,Amount,Currency,Status,Email,TxHash,Date\n";
      const csv = payments.map((p: any) =>
        `${p.id},${p.order_id || ''},${p.amount},${p.currency},${p.status},${p.customer_email},${p.sweep_tx_hash || ''},${p.createdAt.toISOString()}`
      ).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.attachment("payments_history.csv");
      return res.status(200).send(header + csv);
    }

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { [String(sort_by)]: order as any },
        include: { merchant: { select: { business_name: true, email: true } } }
      }),
      prisma.payment.count({ where })
    ]);

    res.json({ data, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getPaymentById = async (req: Request, res: Response) => {
  try {
    const { payment_id } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id: payment_id },
      include: { merchant: true, settlement: true }
    });
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: "Error fetching details" });
  }
};