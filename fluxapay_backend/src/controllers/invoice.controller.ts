import { Request, Response } from "express";
import { validateUserId } from "../helpers/request.helper";
import { AuthRequest } from "../types/express";
import {
  createInvoiceService,
  getInvoiceByIdService,
  listInvoicesService,
  exportInvoiceService,
  updateInvoiceStatusService,
  ExportFormat,
} from "../services/invoice.service";

export async function createInvoice(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await createInvoiceService({
      merchantId,
      amount: req.body.amount,
      currency: req.body.currency,
      customer_email: req.body.customer_email,
      customer_name: req.body.customer_name,
      line_items: req.body.line_items,
      notes: req.body.notes,
      metadata: req.body.metadata,
      due_date: req.body.due_date,
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

export async function getInvoiceById(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    // Route uses either :id or :invoice_id depending on the path
    const invoiceId = req.params.id ?? req.params.invoice_id;
    const result = await getInvoiceByIdService(merchantId, invoiceId);
    res.status(200).json(result);
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

export async function updateInvoiceStatus(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const invoiceId = req.params.id ?? req.params.invoice_id;
    const { status } = req.body;

    const result = await updateInvoiceStatusService(merchantId, invoiceId, status);
    res.status(200).json(result);
  } catch (err: any) {
    if (err.message === "Invoice not found") {
      res.status(404).json({ message: "Invoice not found" });
    } else if (err.message === "Invalid status transition" || err.message === "Invalid status") {
      res.status(400).json({ message: err.message });
    } else {
      res.status(err.status || 500).json({ message: err.message || "Server error" });
    }
  }
}

export async function exportInvoice(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const invoiceId = req.params.id ?? req.params.invoice_id;
    const format = (req.query.format as ExportFormat) || "pdf";

    const result = await exportInvoiceService(merchantId, invoiceId, format);

    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", result.contentType);

    if (result.format === "pdf") {
      result.stream.pipe(res);
      result.stream.on("error", () => {
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to generate PDF" });
        }
      });
    } else if (typeof result.content === "string") {
      res.send(result.content);
    } else {
      res.json(result.content);
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(err.status || 500).json({ message: err.message || "Server error" });
    }
  }
}
