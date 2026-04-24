import { Request, Response } from "express";
import { validateUserId } from "../helpers/request.helper";
import { AuthRequest } from "../types/express";
import { createInvoiceService, listInvoicesService, exportInvoiceService } from "../services/invoice.service";

export async function createInvoice(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await createInvoiceService({
      merchantId,
      amount: req.body.amount,
      currency: req.body.currency,
      customer_email: req.body.customer_email,
      metadata: req.body.metadata,
      due_date: req.body.due_date,
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function listInvoices(req: Request, res: Response) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const q = req.query as {
      page?: number;
      limit?: number;
      status?: "pending" | "paid" | "cancelled" | "overdue";
      search?: string;
    };
    const result = await listInvoicesService({
      merchantId,
      page: q.page ?? 1,
      limit: q.limit ?? 10,
      status: q.status,
      search: q.search,
    });
    res.status(200).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function exportInvoice(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const invoice_id = Array.isArray(req.params.invoice_id) 
      ? req.params.invoice_id[0] 
      : req.params.invoice_id;
    const { format } = req.query as { format?: "csv" | "json" };

    const result = await exportInvoiceService(merchantId, invoice_id, format || "json");

    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", result.contentType);

    if (typeof result.content === "string") {
      res.send(result.content);
    } else {
      res.json(result.content);
    }
  } catch (err: any) {
    if (err.message === "Invoice not found") {
      res.status(404).json({ message: "Invoice not found" });
    } else {
      res.status(err.status || 500).json({ message: err.message || "Server error" });
    }
  }
}
