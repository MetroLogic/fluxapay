const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const PDFDocument = require("pdfkit");

function formatDate(d) {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(amount, currency) {
  return `${Number(amount).toFixed(2)} ${currency.toUpperCase()}`;
}

function statusBadgeColor(status) {
  switch (status.toLowerCase()) {
    case "paid":
    case "confirmed":
    case "completed":
      return "#16a34a";
    case "overdue":
    case "failed":
    case "expired":
      return "#dc2626";
    case "cancelled":
      return "#6b7280";
    default:
      return "#d97706";
  }
}

function renderInvoicePdf(doc, data) {
  doc.fontSize(24).font("Helvetica-Bold").text("FluxaPay", 50, 50)
    .fontSize(10).font("Helvetica").fillColor("#666666").text("Crypto Payment Gateway", 50, 80);

  doc.fontSize(28).font("Helvetica-Bold").fillColor("#1a1a1a").text("INVOICE", 400, 50, { align: "right" });
  doc.fontSize(11).font("Helvetica").fillColor("#444444").text(`# ${data.invoice_number}`, 400, 85, { align: "right" });

  doc.moveTo(50, 110).lineTo(545, 110).strokeColor("#e0e0e0").lineWidth(1).stroke();

  const col1 = 50;
  const col2 = 300;
  let y = 130;

  const createdAtDate = typeof data.created_at === "string" ? new Date(data.created_at) : data.created_at;
  const dueDateObj = data.due_date ? (typeof data.due_date === "string" ? new Date(data.due_date) : data.due_date) : null;

  doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("ISSUE DATE", col1, y);
  doc.fontSize(11).font("Helvetica").fillColor("#1a1a1a").text(formatDate(createdAtDate), col1, y + 14);

  doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("DUE DATE", col2, y);
  doc.fontSize(11).font("Helvetica").fillColor(dueDateObj && dueDateObj < new Date() && data.status !== "paid" ? "#cc0000" : "#1a1a1a").text(dueDateObj ? formatDate(dueDateObj) : "On receipt", col2, y + 14);

  y += 50;

  doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("STATUS", col1, y);
  const statusColor = statusBadgeColor(data.status);
  doc.fontSize(11).font("Helvetica-Bold").fillColor(statusColor).text(data.status.toUpperCase(), col1, y + 14);

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

  y += 50;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
  y += 10;

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

  y += 15;
  if (y > doc.page.height - 120) {
    doc.addPage();
    y = 50;
  }

  doc.fontSize(12).font("Helvetica-Bold").fillColor("#888888").text("TOTAL DUE", 350, y);
  doc.fontSize(16).font("Helvetica-Bold").fillColor("#1a1a1a").text(formatAmount(data.amount, data.currency), 450, y - 2, { width: 95, align: "right" });

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
  doc.text("Invoice ID:", col1, y);
  doc.font("Helvetica-Bold").fillColor("#1a1a1a").text(data.id, 160, y);
  y += 16;

  if (data.payment) {
    doc.font("Helvetica").fillColor("#444444").text("Payment ID:", col1, y);
    doc.font("Helvetica-Bold").fillColor("#1a1a1a").text(data.payment.id, 160, y);
    y += 16;

    doc.font("Helvetica").fillColor("#444444").text("Payment Status:", col1, y);
    doc.font("Helvetica-Bold").fillColor(statusBadgeColor(data.payment.status)).text(data.payment.status.toUpperCase(), 160, y);
    y += 16;
  }

  doc.font("Helvetica").fillColor("#444444").text("Payment Link:", col1, y);
  doc.font("Helvetica").fillColor("#0066cc").text(data.payment_link, 160, y);
  y += 20;

  if (data.notes) {
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888").text("NOTES", col1, y);
    y += 14;
    doc.fontSize(10).font("Helvetica").fillColor("#444444").text(data.notes, col1, y, { width: 495 });
  }

  const pageHeight = doc.page.height;
  doc.fontSize(9).font("Helvetica").fillColor("#aaaaaa").text(
    `Generated by FluxaPay · ${new Date().toISOString()}`,
    50,
    pageHeight - 60,
    { align: "center", width: 495 },
  );
}

async function run() {
  const { outputPath, data, jobId } = workerData;
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const stream = fs.createWriteStream(outputPath);

  stream.on("error", (error) => {
    parentPort.postMessage({ jobId, status: "failed", error: error.message });
  });

  doc.on("error", (error) => {
    parentPort.postMessage({ jobId, status: "failed", error: error.message });
  });

  doc.pipe(stream);
  renderInvoicePdf(doc, data);
  doc.end();

  stream.on("finish", () => {
    parentPort.postMessage({ jobId, status: "completed", filePath: outputPath });
  });
}

run().catch((error) => {
  parentPort.postMessage({ jobId: workerData.jobId, status: "failed", error: error.message });
});
