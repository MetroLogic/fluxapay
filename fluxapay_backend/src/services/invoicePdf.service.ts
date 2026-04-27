import PDFDocument from "pdfkit";
import { Readable } from "stream";

export interface InvoicePdfData {
    invoice_number: string;
    id: string;
    amount: number;
    currency: string;
    customer_email: string;
    status: string;
    due_date: Date | null;
    created_at: Date;
    payment_link: string;
    merchant_name?: string;
    payment?: {
        id: string;
        status: string;
        amount: number;
        currency: string;
    } | null;
}

/**
 * Generates a PDF invoice and returns it as a readable stream.
 * Uses pdfkit — no headless browser required.
 */
export function generateInvoicePdf(data: InvoicePdfData): Readable {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    // ── Header ──────────────────────────────────────────────────────────────
    doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .text("FluxaPay", 50, 50)
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#666666")
        .text("Crypto Payment Gateway", 50, 80);

    // Invoice label (top-right)
    doc
        .fontSize(28)
        .font("Helvetica-Bold")
        .fillColor("#1a1a1a")
        .text("INVOICE", 400, 50, { align: "right" });

    doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor("#444444")
        .text(`# ${data.invoice_number}`, 400, 85, { align: "right" });

    // Divider
    doc.moveTo(50, 110).lineTo(545, 110).strokeColor("#e0e0e0").lineWidth(1).stroke();

    // ── Dates & Status ───────────────────────────────────────────────────────
    const col1 = 50;
    const col2 = 300;
    let y = 130;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("ISSUE DATE", col1, y);
    doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor("#1a1a1a")
        .text(formatDate(data.created_at), col1, y + 14);

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("DUE DATE", col2, y);
    doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor(data.due_date && data.due_date < new Date() && data.status !== "paid" ? "#cc0000" : "#1a1a1a")
        .text(data.due_date ? formatDate(data.due_date) : "On receipt", col2, y + 14);

    y += 50;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("STATUS", col1, y);
    const statusColor = statusBadgeColor(data.status);
    doc.fontSize(11).font("Helvetica-Bold").fillColor(statusColor).text(data.status.toUpperCase(), col1, y + 14);

    // ── Bill To ──────────────────────────────────────────────────────────────
    y += 55;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 15;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("BILL TO", col1, y);
    y += 14;
    doc.fontSize(11).font("Helvetica").fillColor("#1a1a1a").text(data.customer_email, col1, y);

    if (data.merchant_name) {
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("FROM", col2, y - 14);
        doc.fontSize(11).font("Helvetica").fillColor("#1a1a1a").text(data.merchant_name, col2, y);
    }

    // ── Line Items Table ─────────────────────────────────────────────────────
    y += 50;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 10;

    // Table header
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888");
    doc.text("DESCRIPTION", col1, y);
    doc.text("AMOUNT", 450, y, { width: 95, align: "right" });

    y += 18;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 12;

    // Single line item
    doc.fontSize(11).font("Helvetica").fillColor("#1a1a1a");
    doc.text(`Payment — ${data.currency}`, col1, y);
    doc.text(formatAmount(data.amount, data.currency), 450, y, { width: 95, align: "right" });

    y += 30;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();

    // ── Total ────────────────────────────────────────────────────────────────
    y += 15;
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#888888").text("TOTAL DUE", 350, y);
    doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#1a1a1a")
        .text(formatAmount(data.amount, data.currency), 450, y - 2, { width: 95, align: "right" });

    // ── Payment Details ──────────────────────────────────────────────────────
    y += 55;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 15;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("PAYMENT DETAILS", col1, y);
    y += 14;

    doc.fontSize(10).font("Helvetica").fillColor("#444444");
    doc.text(`Invoice ID:`, col1, y);
    doc.font("Helvetica-Bold").fillColor("#1a1a1a").text(data.id, 160, y);
    y += 16;

    if (data.payment) {
        doc.font("Helvetica").fillColor("#444444").text(`Payment ID:`, col1, y);
        doc.font("Helvetica-Bold").fillColor("#1a1a1a").text(data.payment.id, 160, y);
        y += 16;

        doc.font("Helvetica").fillColor("#444444").text(`Payment Status:`, col1, y);
        doc.font("Helvetica-Bold").fillColor(statusBadgeColor(data.payment.status)).text(data.payment.status.toUpperCase(), 160, y);
        y += 16;
    }

    doc.font("Helvetica").fillColor("#444444").text(`Payment Link:`, col1, y);
    doc.font("Helvetica").fillColor("#0066cc").text(data.payment_link, 160, y);

    // ── Footer ───────────────────────────────────────────────────────────────
    const pageHeight = doc.page.height;
    doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#aaaaaa")
        .text(
            `Generated by FluxaPay · ${new Date().toISOString()}`,
            50,
            pageHeight - 60,
            { align: "center", width: 495 },
        );

    doc.end();
    return doc as unknown as Readable;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
    return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function formatAmount(amount: number, currency: string): string {
    return `${Number(amount).toFixed(2)} ${currency.toUpperCase()}`;
}

function statusBadgeColor(status: string): string {
    switch (status.toLowerCase()) {
        case "paid":
        case "confirmed":
        case "completed":
            return "#16a34a"; // green
        case "overdue":
        case "failed":
        case "expired":
            return "#dc2626"; // red
        case "cancelled":
            return "#6b7280"; // gray
        default:
            return "#d97706"; // amber — pending
    }
}
