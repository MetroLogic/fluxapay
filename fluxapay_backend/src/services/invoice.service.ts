import { PrismaClient, Prisma } from "../generated/client/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function buildInvoiceNumber() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `INV-${y}${m}${day}-${suffix}`;
}

export async function createInvoiceService(params: {
  merchantId: string;
  amount: number;
  currency: string;
  customer_email: string;
  metadata?: Record<string, unknown>;
  due_date?: string;
}) {
  const { merchantId, amount, currency, customer_email, metadata, due_date } = params;

  const paymentId = crypto.randomUUID();

  const payment = await prisma.payment.create({
    data: {
      id: paymentId,
      merchantId,
      amount,
      currency,
      customer_email,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      expiration: due_date ? new Date(due_date) : new Date(Date.now() + 15 * 60 * 1000),
      status: "pending",
      checkout_url: `/pay/${paymentId}`,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      merchantId,
      invoice_number: buildInvoiceNumber(),
      amount,
      currency,
      customer_email,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      payment_id: payment.id,
      payment_link: `/pay/${payment.id}`,
      due_date: due_date ? new Date(due_date) : null,
      status: "pending",
    },
  });

  return {
    message: "Invoice created with payment intent",
    data: {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      amount: invoice.amount,
      currency: invoice.currency,
      customer_email: invoice.customer_email,
      payment_id: invoice.payment_id,
      payment_link: invoice.payment_link,
      status: invoice.status,
      due_date: invoice.due_date,
      created_at: invoice.created_at,
    },
  };
}

export async function listInvoicesService(params: {
  merchantId: string;
  page: number;
  limit: number;
  status?: "pending" | "paid" | "cancelled" | "overdue";
}) {
  const { merchantId, page, limit, status } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { merchantId };
  if (status) {
    where.status = status;
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    message: "Invoices retrieved",
    data: {
      invoices,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    },
  };
}
