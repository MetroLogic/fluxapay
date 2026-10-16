import jsPDF from "jspdf";
import {
  type InvoicePreviewData,
  computeInvoiceTotals,
  currencyDecimals,
  formatDate,
} from "./invoicePreview";

/**
 * Build the invoice PDF shown in the preview modal (issue #1254), using the
 * same jsPDF approach as the settlement statement (`lib/downloadPdf.ts`).
 *
 * `qrDataUrl` is a PNG data URL of the payable QR code; when it is missing
 * (e.g. canvas unavailable) the PDF is still produced, without the image.
 */
export function buildInvoicePdf(data: InvoicePreviewData, qrDataUrl?: string | null): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const totals = computeInvoiceTotals(data.lineItems, data.taxRate ?? 0, data.currency);
  // jsPDF's built-in fonts cannot render symbols like ₦, so PDF amounts use
  // the plain "1,234.50 NGN" form.
  const digits = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: currencyDecimals(data.currency),
  });
  const money = (n: number) => `${digits.format(n)} ${data.currency}`;

  const ink: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [100, 116, 139];
  const accent: [number, number, number] = [86, 73, 223];

  // Header
  doc.setFillColor(...ink);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.merchant.businessName, margin, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("INVOICE", margin, 23);
  doc.setFontSize(10);
  doc.text(data.invoiceNumber ?? "DRAFT", pageWidth - margin, 15, { align: "right" });
  doc.setFontSize(8);
  doc.text(`Issued ${formatDate(data.issueDate ?? new Date().toISOString(), "en-US")}`, pageWidth - margin, 23, {
    align: "right",
  });

  let y = 46;
  const field = (label: string, lines: string[], x: number) => {
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), x, y);
    doc.setTextColor(...ink);
    doc.setFontSize(10);
    lines.filter(Boolean).forEach((line, i) => doc.text(line, x, y + 6 + i * 5));
  };
  field("From", [data.merchant.businessName, data.merchant.email ?? ""], margin);
  field("Bill to", [data.customerName, data.customerEmail], pageWidth / 2);
  y += 22;
  field("Due date", [formatDate(data.dueDate, "en-US")], margin);
  field("Currency", [data.currency], pageWidth / 2);
  y += 20;

  // Line items table
  const cols = { desc: margin, qty: pageWidth - 90, price: pageWidth - 60, amount: pageWidth - margin };
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y - 5, pageWidth - margin * 2, 8, "F");
  doc.setTextColor(...muted);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("DESCRIPTION", cols.desc + 2, y);
  doc.text("QTY", cols.qty, y, { align: "right" });
  doc.text("UNIT PRICE", cols.price + 18, y, { align: "right" });
  doc.text("AMOUNT", cols.amount - 2, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 9;

  doc.setTextColor(...ink);
  doc.setFontSize(10);
  for (const line of totals.lines) {
    if (y > pageHeight - 70) {
      doc.addPage();
      y = 20;
    }
    const description = doc.splitTextToSize(line.description || "—", cols.qty - cols.desc - 20) as string[];
    doc.text(description, cols.desc + 2, y);
    doc.text(String(line.quantity), cols.qty, y, { align: "right" });
    doc.text(money(line.unit_price), cols.price + 18, y, { align: "right" });
    doc.text(money(line.amount), cols.amount - 2, y, { align: "right" });
    y += Math.max(1, description.length) * 5 + 3;
  }

  // Breakdown
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(pageWidth / 2, y, pageWidth - margin, y);
  y += 7;
  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(...(bold ? ink : muted));
    doc.text(label, pageWidth / 2, y);
    doc.setTextColor(...ink);
    doc.text(value, pageWidth - margin - 2, y, { align: "right" });
    y += bold ? 8 : 6;
  };
  row("Subtotal", money(totals.subtotal));
  row(`Tax (${totals.taxRate}%)`, money(totals.taxAmount));
  doc.setDrawColor(...accent);
  doc.line(pageWidth / 2, y - 3, pageWidth - margin, y - 3);
  y += 2;
  row("Total due", money(totals.total), true);

  // Payable QR + notes
  y += 6;
  if (qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, "PNG", margin, y, 40, 40);
    } catch {
      // A bad image must not prevent the rest of the PDF.
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  const qrText = data.paymentUrl
    ? ["Scan to pay with USDC on Stellar", data.paymentUrl]
    : ["Payment QR code", "Generated when the invoice is sent to the customer."];
  doc.text(qrText, margin + (qrDataUrl ? 46 : 0), y + 8);
  if (data.notes) {
    const notes = doc.splitTextToSize(`Notes: ${data.notes}`, pageWidth - margin * 2 - 46) as string[];
    doc.text(notes, margin + (qrDataUrl ? 46 : 0), y + 22);
  }

  // Footer
  doc.setFontSize(8);
  doc.text("Powered by FluxaPay", pageWidth / 2, pageHeight - 10, { align: "center" });
  return doc;
}

export function invoicePdfFileName(data: Pick<InvoicePreviewData, "invoiceNumber" | "customerName">): string {
  const base = (data.invoiceNumber || `invoice-${data.customerName || "draft"}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "invoice"}.pdf`;
}
