const prismaMock = {
  invoice: {
    findUnique: jest.fn(),
  },
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => prismaMock),
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
    const mockInvoice = {
      id: "inv_123",
      invoice_number: "INV-20260329-ABC123",
      amount: "100.00",
      currency: "USDC",
      customer_email: "customer@example.com",
      status: "pending",
      due_date: new Date("2026-04-29"),
      created_at: new Date("2026-03-29"),
      metadata: { order_id: "order_456" },
      payment: {
        id: "pay_123",
        amount: "100.00",
        currency: "USDC",
        status: "pending",
        customer_email: "customer@example.com",
        createdAt: new Date("2026-03-29"),
      },
    };

    (validateUserId as jest.Mock).mockResolvedValue("merchant_1");
    (prismaMock.invoice.findUnique as jest.Mock).mockResolvedValue(mockInvoice);

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

    expect(prismaMock.invoice.findUnique).toHaveBeenCalledWith({
      where: { id: "inv_123", merchantId: "merchant_1" },
      include: { payment: true },
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringContaining("invoice-INV-20260329-ABC123.json")
    );
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
    expect(res.json).toHaveBeenCalled();
  });

  it("should successfully export invoice in CSV format", async () => {
    const mockInvoice = {
      id: "inv_123",
      invoice_number: "INV-20260329-ABC123",
      amount: "100.00",
      currency: "USDC",
      customer_email: "customer@example.com",
      status: "pending",
      due_date: new Date("2026-04-29"),
      created_at: new Date("2026-03-29"),
      metadata: {},
      payment: {
        id: "pay_123",
        amount: "100.00",
        currency: "USDC",
        status: "pending",
        customer_email: "customer@example.com",
        createdAt: new Date("2026-03-29"),
      },
    };

    (validateUserId as jest.Mock).mockResolvedValue("merchant_1");
    (prismaMock.invoice.findUnique as jest.Mock).mockResolvedValue(mockInvoice);

    const req: any = {
      params: { invoice_id: "inv_123" },
      query: { format: "csv" },
    };

    const res: any = {
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
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
    (prismaMock.invoice.findUnique as jest.Mock).mockResolvedValue(null);

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
    expect(res.json).toHaveBeenCalledWith({ message: "Invoice not found" });
  });

  it("should enforce merchant ownership (authorization)", async () => {
    (validateUserId as jest.Mock).mockResolvedValue("merchant_1");
    (prismaMock.invoice.findUnique as jest.Mock).mockResolvedValue(null); // Simulates ownership check failure

    const req: any = {
      params: { invoice_id: "inv_456" },
      query: { format: "json" },
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await exportInvoice(req, res);

    // When findUnique returns null (invoice not owned by merchant or doesn't exist)
    // controller returns 404
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("should default to JSON format when format query param is missing", async () => {
    const mockInvoice = {
      id: "inv_123",
      invoice_number: "INV-20260329-ABC123",
      amount: "100.00",
      currency: "USDC",
      customer_email: "customer@example.com",
      status: "pending",
      due_date: new Date("2026-04-29"),
      created_at: new Date("2026-03-29"),
      metadata: {},
      payment: null,
    };

    (validateUserId as jest.Mock).mockResolvedValue("merchant_1");
    (prismaMock.invoice.findUnique as jest.Mock).mockResolvedValue(mockInvoice);

    const req: any = {
      params: { invoice_id: "inv_123" },
      query: {},
    };

    const res: any = {
      setHeader: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await exportInvoice(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
    expect(res.json).toHaveBeenCalled();
  });
});
