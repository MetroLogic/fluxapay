import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { PrismaClient, Prisma, InvoiceStatus } from "../generated/client/client";
import crypto from "crypto";
import { createAndDeliverWebhook } from "./webhook.service";
import { generateInvoicePdf } from "./invoicePdf.service";
import { sendInvoiceEmail } from "./email.service";
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
  tax_rate?: number;
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
    tax_rate,
  } = params;

  // Calculate subtotal from line items
  let subtotal = 0;
  if (line_items && line_items.length > 0) {
    subtotal = line_items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  } else if (params.amount) {
    subtotal = params.amount;
  }

  // Calculate tax
  const taxRate = tax_rate ?? 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const metadataJson = {
    ...metadata,
    ...(customer_name ? { customer_name } : {}),
    ...(line_items ? { line_items } : {}),
    ...(notes ? { notes } : {}),
  } as Prisma.InputJsonValue;

  // Create invoice in draft status
  const invoice = await prisma.invoice.create({
    data: {
      merchantId,
      invoice_number: buildInvoiceNumber(),
      amount: Math.floor(total * 100),
      currency,
      subtotal: Math.floor(subtotal * 100),
      tax_amount: Math.floor(taxAmount * 100),
      tax_rate: taxRate ? Math.floor(taxRate * 100) : null,
      customer_email,
      customer_name,
      line_items: line_items as Prisma.InputJsonValue,
      notes,
      metadata: metadataJson,
      due_date: due_date ? new Date(due_date) : null,
      payment_link: "", // Will be generated when invoice is sent
      status: "draft",
    },
  });

  return {
    message: "Invoice created in draft status",
    data: {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      amount: Number(invoice.amount) / 100,
      subtotal: invoice.subtotal ? Number(invoice.subtotal) / 100 : 0,
      tax_amount: invoice.tax_amount ? Number(invoice.tax_amount) / 100 : 0,
      tax_rate: invoice.tax_rate ? Number(invoice.tax_rate) / 100 : 0,
      currency: invoice.currency,
      customer_email: invoice.customer_email,
      customer_name: invoice.customer_name,
      line_items: invoice.line_items,
      notes: invoice.notes,
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
    throw apiError(404, ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
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
  status?: "draft" | "sent" | "paid" | "overdue" | "voided";
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
  const validStatuses = ["draft", "sent", "paid", "overdue", "voided"];
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
    draft: ["sent", "voided"],
    sent: ["paid", "overdue", "voided"],
    paid: [],        // terminal
    overdue: ["paid", "voided"],
    voided: [],   // terminal
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

export async function sendInvoiceService(merchantId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, merchantId },
    include: { merchant: true },
  });

  if (!invoice) {
    throw apiError(404, ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
  }

  if (invoice.status !== "draft") {
    throw apiError(400, ErrorCode.INVOICE_NOT_DRAFT, "Only draft invoices can be sent");
  }

  // Create payment link if not exists
  let paymentLink = invoice.payment_link;
  if (!paymentLink || !invoice.payment_id) {
    const paymentId = crypto.randomUUID();
    const checkoutBase = process.env.PAY_CHECKOUT_BASE || process.env.BASE_URL || "http://localhost:3000";
    const checkout_url = `${checkoutBase.replace(/\/$/, "")}/pay/${paymentId}`;

    const payment = await prisma.payment.create({
      data: {
        id: paymentId,
        merchantId,
        amount: invoice.amount,
        currency: invoice.currency,
        customer_email: invoice.customer_email,
        metadata: invoice.metadata as Prisma.InputJsonValue,
        description: invoice.notes || `Invoice ${invoice.invoice_number}`,
        expiration: invoice.due_date || new Date(Date.now() + 30 * 24 * 60 * 1000),
        status: "pending",
        checkout_url,
      },
    });

    paymentLink = `/pay/${payment.id}`;

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        payment_id: payment.id,
        payment_link: paymentLink,
      },
    });
  }

  // Update invoice status to sent
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "sent",
      sent_at: new Date(),
    },
  });

  // Send email
  try {
    await sendInvoiceEmail(
      invoice.customer_email,
      invoice.invoice_number,
      (Number(invoice.amount) / 100).toFixed(2),
      invoice.currency,
      invoice.due_date?.toISOString() || null,
      `${process.env.BASE_URL || "http://localhost:3000"}${paymentLink}`,
      invoice.merchant.business_name,
    );
  } catch (err: any) {
    console.error(`[InvoiceService] Failed to send invoice email:`, err);
    // Don't fail the request if email fails
  }

  return {
    message: "Invoice sent successfully",
    data: {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      status: "sent",
      sent_at: new Date(),
      payment_link: paymentLink,
    },
  };
}

export async function voidInvoiceService(merchantId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, merchantId },
  });

  if (!invoice) {
    throw apiError(404, ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
  }

  if (invoice.status === "paid") {
    throw apiError(422, ErrorCode.CANNOT_VOID_PAID_INVOICE, "Cannot void a paid invoice");
  }

  if (invoice.status === "voided") {
    throw apiError(400, ErrorCode.INVOICE_ALREADY_VOIDED, "Invoice is already voided");
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "voided",
      voided_at: new Date(),
    },
  });

  return {
    message: "Invoice voided successfully",
    data: {
      id: updatedInvoice.id,
      invoice_number: updatedInvoice.invoice_number,
      status: updatedInvoice.status,
      voided_at: updatedInvoice.voided_at,
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
    throw apiError(404, ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
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
