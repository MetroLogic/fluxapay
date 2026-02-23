import { Request, Response } from "express";
import { PrismaClient } from "../generated/client/client";
import { PaymentService } from "../services/payment.service";

const prisma = new PrismaClient();

export const createPayment = async (req: Request, res: Response) => {
  try {
    const { merchantId, order_id, amount, currency, customer_email, metadata } = req.body;

    // Use PaymentService to create payment with derived Stellar address
    const payment = await PaymentService.createPayment({
      merchantId,
      amount,
      currency,
      customer_email,
      metadata: metadata || {},
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
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: "Failed to create payment" });
  }
};

export const getPayments = async (req: Request, res: Response) => {
  try {
    // 1. Destructure with explicit type casting immediately
    const query = req.query as Record<string, any>;

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

    const where: any = {
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
      const csv = payments.map((p: any) =>
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
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getPaymentById = async (req: Request, res: Response) => {
  try {
    // Force payment_id to be a single string
    const payment_id = String(req.params.payment_id);

    const payment = await prisma.payment.findUnique({
      where: { id: payment_id }, // This is line 106 that was failing!
      include: { merchant: true, settlement: true }
    });

    if (!payment) return res.status(404).json({ error: "Payment not found" });
    
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: "Error fetching details" });
  }
};