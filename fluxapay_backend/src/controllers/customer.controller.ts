import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
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
      name: req.body.name,
      phone: req.body.phone,
      stellar_address: req.body.stellar_address,
      metadata: req.body.metadata,
    });
    res.status(201).json(row);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
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
      created_after: q.created_after ? new Date(q.created_after as string) : undefined,
      created_before: q.created_before ? new Date(q.created_before as string) : undefined,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
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
    sendApiError(res, err);
  }
}

export async function updateCustomer(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const row = await updateCustomerService({
      merchantId,
      id: String(req.params.id),
      email: req.body.email,
      name: req.body.name,
      phone: req.body.phone,
      stellar_address: req.body.stellar_address,
      metadata: req.body.metadata,
    });
    res.status(200).json(row);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
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
    sendApiError(res, err);
  }
}
