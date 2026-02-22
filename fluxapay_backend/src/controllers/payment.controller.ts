import { Request, Response } from "express";
import { PrismaClient } from "../generated/client/client";

const prisma = new PrismaClient();

export const createPayment = async (req: Request, res: Response) => {
  try {
    const { merchantId, order_id, amount, currency, customer_email, metadata } = req.body;

    // FIX 1: Added missing 'checkout_url' and correctly linked 'merchant'
    const payment = await prisma.payment.create({
      data: {
        amount,
        currency,
        customer_email,
        order_id,
        metadata: metadata || {},
        status: "pending",
        expiration: new Date(Date.now() + 3600000),
        checkout_url: "", // Provide a default or actual URL here
        merchant: {
          connect: { id: merchantId }
        },
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
    // 1. Force extraction as strings
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    
    // Safety check: ensure these are strings and NOT arrays
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const currency = typeof req.query.currency === 'string' ? req.query.currency : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const date_from = typeof req.query.date_from === 'string' ? req.query.date_from : undefined;
    const date_to = typeof req.query.date_to === 'string' ? req.query.date_to : undefined;

    // 2. Fix the TS2322 Error by forcing a single string type
    const sort_by = typeof req.query.sort_by === 'string' ? req.query.sort_by : 'createdAt';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';

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

    // The Export Logic
    if (req.path.includes('/export')) {
      const payments = await prisma.payment.findMany({ 
        where, 
        orderBy: { [sort_by as string]: order } // 'as string' fixes the error
      });
      
      const header = "ID,OrderID,Amount,Currency,Status,Email,Date\n";
      const csv = payments.map((p: any) => 
        `${p.id},${p.order_id || ''},${p.amount},${p.currency},${p.status},${p.customer_email},${p.createdAt}`
      ).join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.attachment("payments_history.csv");
      return res.status(200).send(header + csv);
    }

    // The List Logic
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sort_by as string]: order } // 'as string' fixes the error
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