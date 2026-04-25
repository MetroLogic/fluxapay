import { PrismaClient, Prisma, InvoiceStatus } from "../generated/client/client";
import crypto from "crypto";
import { createAndDeliverWebhook } from "./webhook.service";
import { generateInvoicePdf } from "./invoicePdf.service";
import { Readable } from "stream";

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
  const metadataJson = (metadata ?? {}) as Prisma.InputJsonValue;

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

export async function getInvoiceByIdService(merchantId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, merchantId },
    include: { payment: true },
  });

  if (!invoice) {
    throw { status: 404, message: "Invoice not found" };
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
      updated_at: invoice.updated_at,
      payment_id: invoice.payment_id,
      payment_link: invoice.payment_link,
      metadata: invoice.metadata,
      payment: invoice.payment
        ? {
          id: invoice.payment.id,
          status: invoice.payment.status,
          amount: Number(invoice.payment.amount),
          currency: invoice.payment.currency,
          checkout_url: invoice.payment.checkout_url,
          stellar_address: invoice.payment.stellar_address,
          created_at: invoice.payment.createdAt,
        }
        : null,
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

  const totalPages = Math.max(1, Math.ceil(total / limit));

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

export async function updateInvoiceStatusService(
  merchantId: string,
  invoiceId: string,
  newStatus: string,
) {
  const validStatuses = ["pending", "paid", "cancelled", "overdue"];
  if (!validStatuses.includes(newStatus)) {
    throw new Error("Invalid status");
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, merchantId },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  // Validate status transition
  const validTransitions: Record<string, string[]> = {
    pending: ["paid", "cancelled", "overdue"],
    paid: [],        // terminal
    cancelled: [],   // terminal
    overdue: ["paid", "cancelled"],
  };

  if (!validTransitions[invoice.status]?.includes(newStatus)) {
    throw new Error("Invalid status transition");
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: newStatus as InvoiceStatus },
  });

  // Fire webhook for paid / overdue transitions
  if (newStatus === "paid" || newStatus === "overdue") {
    try {
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
      await createAndDeliverWebhook(merchantId, `invoice_${newStatus}` as any, payload);
    } catch (err: any) {
      if (!err.message?.includes("has no webhook")) {
        console.error(`[InvoiceService] Webhook delivery failed for invoice ${invoiceId}:`, err);
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

// ── Export ────────────────────────────────────────────────────────────────────

export type ExportFormat = "csv" | "json" | "pdf";

export type ExportResult =
  | { format: "pdf"; stream: Readable; filename: string; contentType: string }
  | { format: "csv" | "json"; filename: string; content: string | object; contentType: string };

export async function exportInvoiceService(
  merchantId: string,
  invoiceId: string,
  format: ExportFormat,
): Promise<ExportResult> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, merchantId },
    include: {
      payment: true,
      merchant: { select: { business_name: true } },
    },
  });

  if (!invoice) {
    throw { status: 404, message: "Invoice not found" };
  }

  const payment = invoice.payment;

  // ── PDF ──────────────────────────────────────────────────────────────────
  if (format === "pdf") {
    const stream = generateInvoicePdf({
      invoice_number: invoice.invoice_number,
      id: invoice.id,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      customer_email: invoice.customer_email,
      status: invoice.status,
      due_date: invoice.due_date,
      created_at: invoice.created_at,
      payment_link: invoice.payment_link,
      merchant_name: invoice.merchant?.business_name,
      payment: payment
        ? {
          id: payment.id,
          status: payment.status,
          amount: Number(payment.amount),
          currency: payment.currency,
        }
        : null,
    });

    return {
      format: "pdf",
      stream,
      filename: `invoice-${invoice.invoice_number}.pdf`,
      contentType: "application/pdf",
    };
  }

  // ── CSV ──────────────────────────────────────────────────────────────────
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
      format: "csv",
      filename: `invoice-${invoice.invoice_number}.csv`,
      content: csvContent,
      contentType: "text/csv",
    };
  }

  // ── JSON ─────────────────────────────────────────────────────────────────
  return {
    format: "json",
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
