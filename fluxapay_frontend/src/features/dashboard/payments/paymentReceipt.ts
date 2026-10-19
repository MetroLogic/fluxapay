import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PaymentReceiptData {
  paymentId: string;
  description?: string | null;
  orderId?: string | null;
  createdAt: string | Date;
  amount: number;
  currency: string;
  customerName?: string | null;
  customerEmail?: string | null;
  transactionHash: string;
  transactionUrl: string;
  qrCodeDataUrl: string;
  merchantName: string;
  merchantLogoDataUrl?: string;
  locale?: string;
  settlement?: {
    amount?: number | string | null;
    fees?: number | string | null;
    netAmount?: number | string | null;
    currency?: string | null;
  } | null;
}

export function formatReceiptDate(value: string | Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale || undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatReceiptCurrency(
  value: number | string | null | undefined,
  currency: string,
  locale?: string,
): string {
  if (value === null || value === undefined || value === "") return "Not available";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;

  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(locale || undefined).format(amount)} ${currency}`;
  }
}

export async function loadReceiptLogo(url?: string | null): Promise<string | undefined> {
  if (!url) return undefined;

  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return undefined;

    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

export function generatePaymentReceiptPdf(data: PaymentReceiptData): void {
  if (!data.transactionHash || !data.qrCodeDataUrl) {
    throw new Error("A transaction hash and verification QR code are required.");
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;

  doc.setFillColor(46, 53, 57);
  doc.rect(0, 0, pageWidth, 42, "F");
  if (data.merchantLogoDataUrl) {
    doc.addImage(data.merchantLogoDataUrl, 18, 10, 22, 22);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text(data.merchantName || "Merchant", data.merchantLogoDataUrl ? 46 : margin, 20);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("PAYMENT RECEIPT", data.merchantLogoDataUrl ? 46 : margin, 29);

  doc.setTextColor(46, 53, 57);
  doc.setFontSize(19);
  doc.setFont("helvetica", "bold");
  doc.text("Transaction receipt", margin, 57);

  const infoRows: [string, string][] = [
    ["Invoice number", data.paymentId],
    ["Date", formatReceiptDate(data.createdAt, data.locale)],
    ["Customer", data.customerName || data.customerEmail || "—"],
    ["Email", data.customerEmail || "—"],
    ["Order reference", data.orderId || "—"],
  ];
  autoTable(doc, {
    startY: 64,
    margin: { left: margin, right: margin },
    head: [["Receipt details", ""]],
    body: infoRows,
    theme: "grid",
    headStyles: { fillColor: [46, 53, 57] },
    styles: { fontSize: 9, cellPadding: 2.5, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 43, fontStyle: "bold" }, 1: { cellWidth: "auto" } },
  });

  const lineItems: string[][] = [
    [data.description || "Payment", data.paymentId, formatReceiptCurrency(data.amount, data.currency, data.locale)],
  ];
  if (data.settlement) {
    const settlementCurrency = data.settlement.currency || data.currency;
    if (data.settlement.amount != null) {
      lineItems.push([
        "Settlement gross",
        "",
        formatReceiptCurrency(data.settlement.amount, settlementCurrency, data.locale),
      ]);
    }
    if (data.settlement.fees != null) {
      lineItems.push([
        "Settlement fee",
        "",
        formatReceiptCurrency(data.settlement.fees, settlementCurrency, data.locale),
      ]);
    }
    if (data.settlement.netAmount != null) {
      lineItems.push([
        "Net settlement",
        "",
        formatReceiptCurrency(data.settlement.netAmount, settlementCurrency, data.locale),
      ]);
    }
  } else {
    lineItems.push(["Settlement fee", "", "Not yet settled"]);
  }

  const detailsEndY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 110;
  autoTable(doc, {
    startY: detailsEndY + 10,
    margin: { left: margin, right: margin },
    head: [["Description", "Reference", "Amount / fee"]],
    body: lineItems,
    theme: "striped",
    headStyles: { fillColor: [46, 53, 57] },
    styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 74 }, 1: { cellWidth: 48 }, 2: { halign: "right" } },
  });

  const afterTableY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 150;
  const hashY = Math.min(afterTableY + 15, 245);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Stellar transaction", margin, hashY);
  doc.setFont("helvetica", "normal");
  const hashLines = doc.splitTextToSize(data.transactionHash, 128);
  doc.text(hashLines, margin, hashY + 6);
  doc.setTextColor(0, 102, 204);
  doc.textWithLink("View on Stellar Expert", margin, hashY + 14, {
    url: data.transactionUrl,
  });
  doc.setTextColor(46, 53, 57);
  doc.addImage(data.qrCodeDataUrl, "PNG", pageWidth - margin - 32, hashY - 4, 32, 32);
  doc.setFontSize(8);
  doc.text("Scan to verify", pageWidth - margin - 32, hashY + 32, { align: "center" });

  doc.setFontSize(8);
  doc.setTextColor(108, 116, 125);
  doc.text("Thank you for your business.", margin, 280);
  doc.save(`receipt-${data.paymentId}.pdf`);
}