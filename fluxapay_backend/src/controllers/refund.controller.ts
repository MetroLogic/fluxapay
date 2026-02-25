import { z } from "zod";
import { createController } from "../helpers/controller.helper";
import * as refundSchema from "../schemas/refund.schema";
import {
  initiateRefund,
  getRefund,
  listRefunds,
} from "../services/refund.service";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";

type InitiateRefundRequest = z.infer<typeof refundSchema.initiateRefundSchema>;
type ListRefundsRequest = z.infer<typeof refundSchema.listRefundsSchema>;

export const initiateRefundController = createController<InitiateRefundRequest>(
  async (data, req) => {
    const adminUserId = await validateUserId(req as AuthRequest);
    return initiateRefund(data, adminUserId);
  },
  201,
);

export const getRefundController = createController(
  async (_data, req) => {
    const refundId = req.params.refundId as string;
    return getRefund(refundId);
  },
);

export const listRefundsController = createController(
  async (_data, req) => {
    return listRefunds(req.query as unknown as ListRefundsRequest);
  },
);
