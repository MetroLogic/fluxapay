import { Request, Response } from "express";
import { InvoiceService } from "../services/invoice.service";
import { AuthRequest } from "../types/express";
import { InvoiceStatus } from "../generated/client/client";

export const createInvoice = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const merchantId = authReq.merchantId;

    if (!merchantId) {
      return res.status(401).json({ error: "Unauthorized: Merchant ID missing" });
    }

    const invoice = await InvoiceService.createInvoice(req.body, merchantId);
    res.status(201).json(invoice);
  } catch (error: unknown) {
    console.error("Error creating invoice:", error);
    res.status(500).json({ error: "Failed to create invoice" });
  }
};

export const getInvoices = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const merchantId = authReq.merchantId;

    const query = req.query as Record<string, unknown>;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const status = query.status ? String(query.status) : undefined;
    const search = query.search ? String(query.search) : undefined;

    const result = await InvoiceService.getInvoices(merchantId!, {
      status,
      search,
      page,
      limit,
    });

    res.json(result);
  } catch (error: unknown) {
    console.error("Error listing invoices:", error);
    res.status(500).json({ error: "Failed to list invoices" });
  }
};

export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const merchantId = authReq.merchantId;
    const { id } = req.params;

    const invoice = await InvoiceService.getInvoiceById(id as string, merchantId!);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    res.json(invoice);
  } catch (error: unknown) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
};

export const updateInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const merchantId = authReq.merchantId;
    const { id } = req.params;
    const { status } = req.body as { status: InvoiceStatus };

    const invoice = await InvoiceService.updateInvoiceStatus(id as string, status, merchantId!);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    res.json(invoice);
  } catch (error: unknown) {
    console.error("Error updating invoice status:", error);
    res.status(500).json({ error: "Failed to update invoice status" });
  }
};
