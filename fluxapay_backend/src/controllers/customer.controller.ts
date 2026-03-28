import { Request, Response } from "express";
import { validateUserId } from "../helpers/request.helper";
import { AuthRequest } from "../types/express";
import {
  createCustomerService,
  listCustomersService,
  getCustomerByIdService,
  updateCustomerService,
  deleteCustomerService,
} from "../services/customer.service";

export async function createCustomer(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const row = await createCustomerService({
      merchantId,
      email: req.body.email,
      metadata: req.body.metadata,
    });
    res.status(201).json(row);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status || 500).json({ message: e.message || "Server error" });
  }
}

export async function listCustomers(req: Request, res: Response) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const q = req.query as Record<string, unknown>;
    const result = await listCustomersService({
      merchantId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 20,
      search: q.search ? String(q.search) : undefined,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status || 500).json({ message: e.message || "Server error" });
  }
}

export async function getCustomerById(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const row = await getCustomerByIdService({
      merchantId,
      id: String(req.params.id),
    });
    res.status(200).json(row);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status || 500).json({ message: e.message || "Server error" });
  }
}

export async function updateCustomer(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const row = await updateCustomerService({
      merchantId,
      id: String(req.params.id),
      email: req.body.email,
      metadata: req.body.metadata,
    });
    res.status(200).json(row);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status || 500).json({ message: e.message || "Server error" });
  }
}

export async function deleteCustomer(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    await deleteCustomerService({
      merchantId,
      id: String(req.params.id),
    });
    res.status(204).send();
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status || 500).json({ message: e.message || "Server error" });
  }
}
