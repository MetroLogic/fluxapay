import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { createController } from "../helpers/controller.helper";
import {
  initializeEscrowContract,
  releaseEscrowFunds,
  refundEscrowFunds,
} from "../services/escrow.service";
import { AuthRequest } from "../types/express";

export const initializeEscrow = createController(async (body: any, req: AuthRequest) => {
  const merchantId = req.merchantId || req.user?.id;
  if (!merchantId) {
    throw apiError(401, ErrorCode.AUTHENTICATION_REQUIRED, "Authentication required");
  }

  return initializeEscrowContract({
    paymentId: body.payment_id,
    amount: body.amount,
    currency: body.currency,
    merchantPublicKey: body.merchant_public_key,
  });
});

export const releaseEscrow = createController(async (body: any, req: AuthRequest) => {
  const merchantId = req.merchantId || req.user?.id;
  if (!merchantId) {
    throw apiError(401, ErrorCode.AUTHENTICATION_REQUIRED, "Authentication required");
  }

  return releaseEscrowFunds({
    paymentId: typeof req.params.id === 'string' ? req.params.id : req.params.id[0],
    merchantId,
  });
});

export const refundEscrow = createController(async (body: any, req: AuthRequest) => {
  // This can be called by admin or customer
  return refundEscrowFunds({
    paymentId: typeof req.params.id === 'string' ? req.params.id : req.params.id[0],
    reason: body.reason,
    initiatedBy: body.initiated_by || "admin",
  });
});
