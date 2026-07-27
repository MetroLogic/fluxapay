import PDFDocument from "pdfkit";
import { Readable } from "stream";
import { Worker } from "worker_threads";
import path from "path";
import os from "os";
import fs from "fs";
import crypto from "crypto";

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
    line_items?: Array<{
        description: string;
        quantity: number;
        unit_price: number;
        amount?: number;
    }>;
    notes?: string;
    payment?: {
        id: string;
        status: string;
        amount: number;
        currency: string;
    } | null;
}

export interface InvoicePdfJob {
    id: string;
    status: "processing" | "completed" | "failed";
    filename: string;
    contentType: string;
    filePath?: string;
    error?: string;
    createdAt: Date;
    completedAt?: Date;
    merchantId: string;
    invoiceId: string;
}

const invoicePdfJobs = new Map<string, InvoicePdfJob>();

/** How long a completed/failed job stays in the map before eviction (1 hour). */
const JOB_TTL_MS = 60 * 60 * 1000;

/** Hard cap on map size — evict oldest entries when exceeded. */
const MAX_JOBS = 1000;

function evictJob(jobId: string): void {
    const job = invoicePdfJobs.get(jobId);
    if (!job) return;
    // Remove temp PDF from disk
    if (job.filePath) {
        fs.unlink(job.filePath, () => {});
    }
    invoicePdfJobs.delete(jobId);
}

function scheduleEviction(jobId: string): void {
    setTimeout(() => evictJob(jobId), JOB_TTL_MS).unref();
}

function enforceMaxJobs(): void {
    while (invoicePdfJobs.size > MAX_JOBS) {
        const oldest = invoicePdfJobs.keys().next().value;
        if (oldest) evictJob(oldest);
    }
}

export function renderInvoicePdf(doc: InstanceType<typeof PDFDocument>, data: InvoicePdfData): void {
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

    const createdAtDate = typeof data.created_at === "string" ? new Date(data.created_at) : data.created_at;
    const dueDateObj = data.due_date ? (typeof data.due_date === "string" ? new Date(data.due_date) : data.due_date) : null;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("ISSUE DATE", col1, y);
    doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor("#1a1a1a")
        .text(formatDate(createdAtDate), col1, y + 14);

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("DUE DATE", col2, y);
    doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor(dueDateObj && dueDateObj < new Date() && data.status !== "paid" ? "#cc0000" : "#1a1a1a")
        .text(dueDateObj ? formatDate(dueDateObj) : "On receipt", col2, y + 14);

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
    doc.text("QTY x PRICE", col2, y);
    doc.text("AMOUNT", 450, y, { width: 95, align: "right" });

    y += 18;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 12;

    const lineItems = data.line_items && data.line_items.length > 0 ? data.line_items : [
        {
            description: `Payment — ${data.currency}`,
            quantity: 1,
            unit_price: data.amount,
            amount: data.amount,
        },
    ];

    for (const item of lineItems) {
        if (y > doc.page.height - 100) {
            doc.addPage();
            y = 50;
            // Header for new page
            doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888");
            doc.text("DESCRIPTION", col1, y);
            doc.text("QTY x PRICE", col2, y);
            doc.text("AMOUNT", 450, y, { width: 95, align: "right" });
            y += 18;
            doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
            y += 12;
        }

        const itemTotal = item.amount ?? (item.quantity * item.unit_price);
        doc.fontSize(11).font("Helvetica").fillColor("#1a1a1a");
        doc.text(item.description, col1, y, { width: 230 });
        doc.text(`${item.quantity} x ${formatAmount(item.unit_price, data.currency)}`, col2, y);
        doc.text(formatAmount(itemTotal, data.currency), 450, y, { width: 95, align: "right" });
        y += 20;
    }

    y += 10;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();

    // ── Total ────────────────────────────────────────────────────────────────
    y += 15;
    if (y > doc.page.height - 120) {
        doc.addPage();
        y = 50;
    }

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#888888").text("TOTAL DUE", 350, y);
    doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#1a1a1a")
        .text(formatAmount(data.amount, data.currency), 450, y - 2, { width: 95, align: "right" });

    // ── Payment Details & Notes ─────────────────────────────────────────────
    y += 55;
    if (y > doc.page.height - 150) {
        doc.addPage();
        y = 50;
    }

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
    y += 20;

    if (data.notes) {
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("NOTES", col1, y);
        y += 14;
        doc.fontSize(10).font("Helvetica").fillColor("#444444").text(data.notes, col1, y, { width: 495 });
    }

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
}

/**
 * Generates a PDF invoice and returns it as a readable stream.
 * Uses pdfkit — no headless browser required.
 */
export function generateInvoicePdf(data: InvoicePdfData): Readable {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    renderInvoicePdf(doc, data);
    doc.end();
    return doc as unknown as Readable;
}

export function startInvoicePdfGeneration(data: InvoicePdfData, filename: string, merchantId: string, invoiceId: string): InvoicePdfJob {
    const jobId = crypto.randomUUID();
    const outputPath = path.join(os.tmpdir(), `fluxapay-invoice-${jobId}.pdf`);
    const job: InvoicePdfJob = {
        id: jobId,
        status: "processing",
        filename,
        contentType: "application/pdf",
        filePath: outputPath,
        createdAt: new Date(),
        merchantId,
        invoiceId,
    };

    invoicePdfJobs.set(jobId, job);
    enforceMaxJobs();

    const possibleWorkerPaths = [
        path.resolve(__dirname, "invoicePdf.worker.js"),
        path.resolve(__dirname, "..", "..", "src", "services", "invoicePdf.worker.js"),
        path.resolve(__dirname, "..", "..", "dist", "services", "invoicePdf.worker.js"),
    ];
    const workerPath = possibleWorkerPaths.find((candidate) => fs.existsSync(candidate)) ?? possibleWorkerPaths[0];
    const worker = new Worker(workerPath, {
        workerData: { outputPath, data, jobId },
    });

    worker.on("message", (message: { jobId: string; status: "completed" | "failed"; filePath?: string; error?: string }) => {
        const currentJob = invoicePdfJobs.get(message.jobId);
        if (!currentJob) {
            return;
        }

        if (message.status === "completed") {
            currentJob.status = "completed";
            currentJob.filePath = message.filePath;
            currentJob.completedAt = new Date();
            scheduleEviction(message.jobId);
        } else {
            currentJob.status = "failed";
            currentJob.error = message.error ?? "Failed to generate PDF";
            currentJob.completedAt = new Date();
            scheduleEviction(message.jobId);
        }
    });

    worker.on("error", (error: Error) => {
        const currentJob = invoicePdfJobs.get(jobId);
        if (currentJob) {
            currentJob.status = "failed";
            currentJob.error = error.message;
            currentJob.completedAt = new Date();
            scheduleEviction(jobId);
        }
    });

    worker.on("exit", (code) => {
        if (code !== 0) {
            const currentJob = invoicePdfJobs.get(jobId);
            if (currentJob && currentJob.status === "processing") {
                currentJob.status = "failed";
                currentJob.error = `Worker exited with code ${code}`;
                currentJob.completedAt = new Date();
                scheduleEviction(jobId);
            }
        }
    });

    return job;
}

export function getInvoicePdfJob(jobId: string): InvoicePdfJob | undefined {
    return invoicePdfJobs.get(jobId);
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
