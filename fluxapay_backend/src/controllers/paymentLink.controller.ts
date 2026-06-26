import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { Request, Response } from "express";
import { validateUserId } from "../helpers/request.helper";
import { AuthRequest } from "../types/express";
import {
  createPaymentLinkService,
  getPaymentLinkByIdService,
  listPaymentLinksService,
  updatePaymentLinkService,
  deletePaymentLinkService,
} from "../services/paymentLink.service";

export async function createPaymentLink(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await createPaymentLinkService({
      merchantId,
      title: req.body.title,
      description: req.body.description,
      amount: req.body.amount,
      currency: req.body.currency,
      redirect_url: req.body.redirect_url,
      expiry: req.body.expiry,
      metadata: req.body.metadata,
      customer_id: req.body.customer_id,
    });
    res.status(201).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function getPaymentLinkById(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await getPaymentLinkByIdService({
      merchantId,
      id: String(req.params.id),
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function listPaymentLinks(req: Request, res: Response) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const q = req.query as Record<string, unknown>;
    const result = await listPaymentLinksService({
      merchantId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 20,
      active: q.active !== undefined ? q.active === "true" : undefined,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function updatePaymentLink(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await updatePaymentLinkService({
      merchantId,
      id: String(req.params.id),
      title: req.body.title,
      description: req.body.description,
      redirect_url: req.body.redirect_url,
      active: req.body.active,
      metadata: req.body.metadata,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}

export async function deletePaymentLink(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    await deletePaymentLinkService({
      merchantId,
      id: String(req.params.id),
    });
    res.status(204).send();
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    sendApiError(res, err);
  }
}
