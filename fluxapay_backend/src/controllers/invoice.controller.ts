import { Request, Response } from "express";
import { validateUserId } from "../helpers/request.helper";
import { AuthRequest } from "../types/express";
import { createInvoiceService, listInvoicesService } from "../services/invoice.service";

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
    const result = await listInvoicesService({
      merchantId,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      status: req.query.status as "pending" | "paid" | "cancelled" | "overdue" | undefined,
    });
    res.status(200).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}
