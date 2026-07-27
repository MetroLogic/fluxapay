import { renderInvoicePdf, generateInvoicePdf, startInvoicePdfGeneration, getInvoicePdfJob, InvoicePdfData } from "../invoicePdf.service";
import PDFDocument from "pdfkit";

describe("Invoice PDF Service", () => {
  const sampleData: InvoicePdfData = {
    invoice_number: "INV-20260727-001",
    id: "inv_test_123",
    amount: 150.50,
    currency: "USDC",
    customer_email: "client@example.com",
    status: "sent",
    due_date: new Date("2026-08-30"),
    created_at: new Date("2026-07-27"),
    payment_link: "/pay/pay_test_123",
    merchant_name: "Acme Corp",
    line_items: [
      { description: "Item 1", quantity: 2, unit_price: 50.00, amount: 100.00 },
      { description: "Item 2", quantity: 1, unit_price: 50.50, amount: 50.50 },
    ],
    notes: "Thank you for your business!",
  };

  it("should render PDF without throwing errors", () => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    expect(() => renderInvoicePdf(doc as any, sampleData)).not.toThrow();
  });

  it("should generate readable PDF stream", () => {
    const stream = generateInvoicePdf(sampleData);
    expect(stream).toBeDefined();
  });

  it("should start async PDF generation job and retrieve job status", () => {
    const job = startInvoicePdfGeneration(sampleData, "invoice-test.pdf", "merchant_123", "inv_test_123");
    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
    expect(job.status).toBe("processing");
    expect(job.merchantId).toBe("merchant_123");
    expect(job.invoiceId).toBe("inv_test_123");

    const retrievedJob = getInvoicePdfJob(job.id);
    expect(retrievedJob).toEqual(job);
  });

  it("should handle large invoices with many line items and trigger pagination", () => {
    const manyLineItems = Array.from({ length: 50 }, (_, i) => ({
      description: `Line item #${i + 1} with detailed description`,
      quantity: i + 1,
      unit_price: 10.00,
      amount: (i + 1) * 10.00,
    }));

    const largeData: InvoicePdfData = {
      ...sampleData,
      line_items: manyLineItems,
    };

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const addPageSpy = jest.spyOn(doc, "addPage");
    renderInvoicePdf(doc as any, largeData);
    expect(addPageSpy).toHaveBeenCalled();
  });
});
