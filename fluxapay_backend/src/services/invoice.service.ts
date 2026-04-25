import { PrismaClient, Prisma, InvoiceStatus } from "../generated/client/client";
import crypto from "crypto";
import { createAndDeliverWebhook } from "./webhook.service";

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
  amount?: number;
  currency: string;
  customer_email: string;
  customer_name?: string;
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
  }>;
  notes?: string;
  metadata?: Record<string, unknown>;
  due_date?: string;
}) {
  const {
    merchantId,
    currency,
    customer_email,
    customer_name,
    line_items,
    notes,
    metadata = {},
    due_date,
  } = params;
  const metadataJson = {
    ...metadata,
    ...(customer_name ? { customer_name } : {}),
    ...(line_items ? { line_items } : {}),
    ...(notes ? { notes } : {}),
  } as Prisma.InputJsonValue;

  // Calculate amount from line items if not provided
  let amount = params.amount;
  if (amount === undefined && line_items) {
    amount = line_items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  }

  if (amount === undefined) {
    throw new Error("Amount is required if line_items are not provided");
  }

  // Create payment first
  const paymentId = crypto.randomUUID();
  const checkoutBase = process.env.PAY_CHECKOUT_BASE || process.env.BASE_URL || "http://localhost:3000";
  const checkout_url = `${checkoutBase.replace(/\/$/, "")}/pay/${paymentId}`;

  const payment = await prisma.payment.create({
    data: {
      id: paymentId,
      merchantId,
      amount,
      currency,
      customer_email,
      metadata: metadataJson,
      description: notes || `Invoice for ${customer_email}`,
      expiration: due_date ? new Date(due_date) : new Date(Date.now() + 15 * 60 * 1000),
      status: "pending",
      checkout_url,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      merchantId,
      invoice_number: buildInvoiceNumber(),
      amount,
      currency,
      customer_email,
      metadata: metadataJson,
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
  search?: string;
}) {
  const { merchantId, page, limit, status, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.InvoiceWhereInput = { merchantId };
  if (status) {
    where.status = status;
  }
  const q = search?.trim();
  if (q) {
    where.OR = [
      { invoice_number: { contains: q, mode: "insensitive" } },
      { customer_email: { contains: q, mode: "insensitive" } },
    ];
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

  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

  return {
    message: "Invoices retrieved",
    data: { invoices },
    meta: {
      page,
      limit,
      total,
      total_pages: totalPages,
    },
  };
}

export async function getInvoiceByIdService(
  merchantId: string,
  invoiceId: string
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, merchantId },
    include: { payment: true },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  return {
    message: "Invoice retrieved",
    data: {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      customer_email: invoice.customer_email,
      status: invoice.status,
      due_date: invoice.due_date,
      created_at: invoice.created_at,
      metadata: invoice.metadata,
      payment_id: invoice.payment_id,
      payment_link: invoice.payment_link,
      payment: invoice.payment
        ? {
            id: invoice.payment.id,
            amount: Number(invoice.payment.amount),
            currency: invoice.payment.currency,
            status: invoice.payment.status,
            customer_email: invoice.payment.customer_email,
            created_at: invoice.payment.createdAt,
            checkout_url: invoice.payment.checkout_url,
          }
        : null,
    },
  };
}

export async function updateInvoiceStatusService(
  merchantId: string,
  invoiceId: string,
  newStatus: string
) {
  // Validate status transition
  const validStatuses = ["pending", "paid", "cancelled", "overdue"];
  if (!validStatuses.includes(newStatus)) {
    throw new Error("Invalid status");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, merchantId },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  // Check if status transition is valid
  const currentStatus = invoice.status;
  const validTransitions: Record<string, string[]> = {
    pending: ["paid", "cancelled", "overdue"],
    paid: [], // Paid is terminal
    cancelled: [], // Cancelled is terminal
    overdue: ["paid", "cancelled"], // Overdue can be paid or cancelled
  };

  if (!validTransitions[currentStatus]?.includes(newStatus)) {
    throw new Error("Invalid status transition");
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: newStatus as InvoiceStatus },
  });

  if (newStatus === "paid" || newStatus === "overdue") {
    try {
      const eventType = newStatus === "paid" ? "invoice_paid" : "invoice_overdue";
      const payload = {
        event: `invoice.${newStatus}`,
        invoice_id: updatedInvoice.id,
        invoice_number: updatedInvoice.invoice_number,
        amount: updatedInvoice.amount.toString(),
        currency: updatedInvoice.currency,
        status: newStatus,
        customer_email: updatedInvoice.customer_email,
        updated_at: updatedInvoice.updated_at.toISOString(),
      };
      
      // We explicitly cast to 'any' for the enum type to avoid Prisma typing issues immediately after generation
      await createAndDeliverWebhook(
        merchantId,
        eventType as any,
        payload
      );
    } catch (err: any) {
      if (!err.message?.includes("has no webhook")) {
        console.error(`[InvoiceService] Failed to deliver webhook for invoice ${invoiceId}:`, err);
      }
    }
  }

  return {
    message: "Invoice status updated",
    data: {
      id: updatedInvoice.id,
      invoice_number: updatedInvoice.invoice_number,
      status: updatedInvoice.status,
      updated_at: updatedInvoice.updated_at,
    },
  };
}

export async function exportInvoiceService(
  merchantId: string,
  invoiceId: string,
  format: "csv" | "json"
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, merchantId },
    include: { payment: true },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  // Enrich with payment data
  const payment = invoice.payment;

  if (format === "csv") {
    const csvContent = [
      `INVOICE - ${invoice.invoice_number}`,
      `Merchant Invoice ID,${invoice.id}`,
      `Amount,${invoice.amount},${invoice.currency}`,
      `Customer Email,${invoice.customer_email}`,
      `Status,${invoice.status}`,
      `Due Date,"${invoice.due_date ? invoice.due_date.toISOString().split("T")[0] : "N/A"}"`,
      `Created Date,${invoice.created_at.toISOString().split("T")[0]}`,
      ``,
      `PAYMENT DETAILS`,
      `Payment ID,${payment?.id || "N/A"}`,
      `Amount Paid,${payment?.amount || 0},${payment?.currency || invoice.currency}`,
      `Status,${payment?.status || "N/A"}`,
      `Checkout URL,${invoice.payment_link}`,
    ].join("\n");

    return {
      filename: `invoice-${invoice.invoice_number}.csv`,
      content: csvContent,
      contentType: "text/csv",
    };
  }

  // JSON format - return structured data for client-side PDF generation
  return {
    filename: `invoice-${invoice.invoice_number}.json`,
    content: {
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        customer_email: invoice.customer_email,
        status: invoice.status,
        due_date: invoice.due_date,
        created_at: invoice.created_at,
        metadata: invoice.metadata,
      },
      payment: payment
        ? {
          id: payment.id,
          amount: Number(payment.amount),
          currency: payment.currency,
          status: payment.status,
          customer_email: payment.customer_email,
          created_at: payment.createdAt,
        }
        : null,
    },
    contentType: "application/json",
  };
}
