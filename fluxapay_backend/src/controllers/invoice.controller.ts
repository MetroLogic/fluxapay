import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Request, Response } from "express";
import { validateUserId } from "../helpers/request.helper";
import { AuthRequest } from "../types/express";
import {
  createInvoiceService,
  getInvoiceByIdService,
  listInvoicesService,
  exportInvoiceService,
  updateInvoiceStatusService,
  sendInvoiceService,
  voidInvoiceService,
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
    sendApiError(res, err);
  }
}

export async function getInvoiceById(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    // Route uses either :id or :invoice_id depending on the path
    const invoiceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? (Array.isArray(req.params.invoice_id) ? req.params.invoice_id[0] : req.params.invoice_id);
    const result = await getInvoiceByIdService(merchantId, invoiceId);
    res.status(200).json(result);
  } catch (err: any) {
    sendApiError(res, err);
  }
}

export async function listInvoices(req: Request, res: Response) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const q = req.query as {
      page?: number;
      limit?: number;
      status?: "draft" | "sent" | "paid" | "overdue" | "voided";
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
    sendApiError(res, err);
  }
}

export async function updateInvoiceStatus(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const invoiceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? (Array.isArray(req.params.invoice_id) ? req.params.invoice_id[0] : req.params.invoice_id);
    const { status } = req.body;

    const result = await updateInvoiceStatusService(merchantId, invoiceId, status);
    res.status(200).json(result);
  } catch (err: any) {
    if (err.message === "Invoice not found") {
      sendApiError(res, apiError(404, ErrorCode.INVOICE_NOT_FOUND, "Invoice not found"));
    } else if (err.message === "Invalid status transition" || err.message === "Invalid status") {
      sendApiError(res, apiError(400, ErrorCode.VALIDATION_ERROR, err.message));
    } else {
      sendApiError(res, err);
    }
  }
}

export async function sendInvoice(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const invoiceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? (Array.isArray(req.params.invoice_id) ? req.params.invoice_id[0] : req.params.invoice_id);

    const result = await sendInvoiceService(merchantId, invoiceId);
    res.status(200).json(result);
  } catch (err: any) {
    sendApiError(res, err);
  }
}

export async function voidInvoice(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const invoiceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? (Array.isArray(req.params.invoice_id) ? req.params.invoice_id[0] : req.params.invoice_id);

    const result = await voidInvoiceService(merchantId, invoiceId);
    res.status(200).json(result);
  } catch (err: any) {
    sendApiError(res, err);
  }
}

export async function exportInvoice(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const invoiceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? (Array.isArray(req.params.invoice_id) ? req.params.invoice_id[0] : req.params.invoice_id);
    const format = (req.query.format as ExportFormat) || "pdf";

    const result = await exportInvoiceService(merchantId, invoiceId, format);

    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", result.contentType);
    if (result.format === "pdf") {
      result.stream.pipe(res);
      result.stream.on("error", () => {
        if (!res.headersSent) {
          sendApiError(res, apiError(500, ErrorCode.PDF_GENERATION_FAILED, "Failed to generate PDF"));
        }
      });
    } else if (typeof result.content === "string") {
      res.send(result.content);
    } else {
      res.json(result.content);
    }
  } catch (err: any) {
    if (!res.headersSent) {
      sendApiError(res, err);
    }
  }
}
