const exportInvoiceServiceMock = jest.fn();

jest.mock("../../services/invoice.service", () => ({
  exportInvoiceService: (...args: unknown[]) => exportInvoiceServiceMock(...args),
}));

jest.mock("../../helpers/request.helper", () => ({
  validateUserId: jest.fn(),
}));

import { exportInvoice } from "../invoice.controller";
import { validateUserId } from "../../helpers/request.helper";

describe("exportInvoice controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully export invoice in JSON format", async () => {
    const mockContent = {
      invoice: {
        id: "inv_123",
        invoice_number: "INV-20260329-ABC123",
        amount: 100,
        currency: "USDC",
        customer_email: "customer@example.com",
        status: "pending",
      },
      payment: {
        id: "pay_123",
        amount: 100,
        currency: "USDC",
        status: "pending",
        customer_email: "customer@example.com",
      },
    };

    (validateUserId as jest.Mock).mockResolvedValue("merchant_1");
    exportInvoiceServiceMock.mockResolvedValue({
      format: "json",
      filename: "invoice-INV-20260329-ABC123.json",
      contentType: "application/json",
      content: mockContent,
    });

    const req: any = {
      params: { invoice_id: "inv_123" },
      query: { format: "json" },
    };

    const res: any = {
      setHeader: jest.fn().mockReturnThis(),
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await exportInvoice(req, res);

    expect(exportInvoiceServiceMock).toHaveBeenCalledWith(
      "merchant_1",
      "inv_123",
      "json",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringContaining("invoice-INV-20260329-ABC123.json")
    );
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
    expect(res.json).toHaveBeenCalledWith(mockContent);
  });

  it("should successfully export invoice in CSV format", async () => {
    (validateUserId as jest.Mock).mockResolvedValue("merchant_1");
    exportInvoiceServiceMock.mockResolvedValue({
      format: "csv",
      filename: "invoice-INV-20260329-ABC123.csv",
      contentType: "text/csv",
      content: "INVOICE - INV-20260329-ABC123",
    });

    const req: any = {
      params: { invoice_id: "inv_123" },
      query: { format: "csv" },
    };

    const res: any = {
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await exportInvoice(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringContaining("invoice-INV-20260329-ABC123.csv")
    );
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv");
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining("INVOICE"));
  });

  it("should return 404 when invoice not found", async () => {
    (validateUserId as jest.Mock).mockResolvedValue("merchant_1");
    exportInvoiceServiceMock.mockRejectedValue({
      status: 404,
      code: "INVOICE_NOT_FOUND",
      message: "Invoice not found",
    });

    const req: any = {
      params: { invoice_id: "inv_nonexistent" },
      query: { format: "json" },
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await exportInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: "INVOICE_NOT_FOUND",
      message: "Invoice not found",
    });
  });

  it("should enforce merchant ownership (authorization)", async () => {
    (validateUserId as jest.Mock).mockResolvedValue("merchant_1");
    exportInvoiceServiceMock.mockRejectedValue({
      status: 404,
      code: "INVOICE_NOT_FOUND",
      message: "Invoice not found",
    });

    const req: any = {
      params: { invoice_id: "inv_456" },
      query: { format: "json" },
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await exportInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("should accept PDF export requests asynchronously and return a job ID", async () => {
    (validateUserId as jest.Mock).mockResolvedValue("merchant_1");
    exportInvoiceServiceMock.mockResolvedValue({
      format: "pdf",
      filename: "invoice-INV-20260329-ABC123.pdf",
      contentType: "application/pdf",
      status: "accepted",
      jobId: "job_pdf_123",
    });

    const req: any = {
      params: { invoice_id: "inv_123" },
      query: {},
    };

    const res: any = {
      setHeader: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await exportInvoice(req, res);

    expect(exportInvoiceServiceMock).toHaveBeenCalledWith(
      "merchant_1",
      "inv_123",
      "pdf",
    );
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job_pdf_123",
      status: "accepted",
      filename: "invoice-INV-20260329-ABC123.pdf",
      contentType: "application/pdf",
    }));
  });
});
