import { Request, Response } from "express";
import { validateUserId } from "../helpers/request.helper";
import { AuthRequest } from "../types/express";
import {
  createRefundService,
  listRefundsService,
  updateRefundStatusService,
} from "../services/refund.service";
import { RefundStatus } from "../generated/client/client";

export async function createRefund(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const result = await createRefundService({
      merchantId,
      payment_id: req.body.payment_id,
      amount: req.body.amount,
      reason: req.body.reason,
      idempotency_key:
        req.body.idempotency_key ||
        (req.headers["idempotency-key"] as string | undefined),
    });

    res.status(201).json(result);
  } catch (err: any) {
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
}

export async function listRefunds(req: Request, res: Response) {
  try {
    const merchantId = await validateUserId(req as AuthRequest);
    const result = await listRefundsService({
      merchantId,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      status: req.query.status as RefundStatus | undefined,
    });

    res.status(200).json(result);
  } catch (err: any) {
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
}

export async function updateRefundStatus(req: AuthRequest, res: Response) {
  try {
    const merchantId = await validateUserId(req);
    const { refund_id } = req.params;

    const result = await updateRefundStatusService({
      merchantId,
      refund_id,
      status: req.body.status,
      failed_reason: req.body.failed_reason,
    });

    res.status(200).json(result);
  } catch (err: any) {
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
}
