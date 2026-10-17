import { Request, Response } from "express";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { AuthRequest } from "../types/express";
import { createPayoutMethodSchema, payoutMethodIdParamSchema } from "../schemas/payoutMethod.schema";
import {
  archivePayoutMethod,
  createPayoutMethod,
  listPayoutMethods,
} from "../services/payoutMethod.service";

function requireMerchant(req: Request, res: Response): string | null {
  const merchantId = (req as AuthRequest).merchantId;
  if (!merchantId) {
    sendApiError(res, apiError(401, ErrorCode.AUTHENTICATION_REQUIRED, "Authentication required"));
    return null;
  }
  return merchantId;
}

function validationFailed(res: Response, issues: Array<{ path: PropertyKey[]; message: string }>) {
  return sendApiError(
    res,
    apiError(400, ErrorCode.VALIDATION_ERROR, "Validation failed", {
      errors: issues.map((i) => ({ field: i.path.map(String).join("."), message: i.message })),
    }),
  );
}

/** GET /api/v1/merchants/payout-methods */
export async function getPayoutMethods(req: Request, res: Response) {
  const merchantId = requireMerchant(req, res);
  if (!merchantId) return;
  try {
    const includeArchived = String(req.query.include_archived ?? "") === "true";
    res.json({ data: await listPayoutMethods(merchantId, { includeArchived }) });
  } catch (error) {
    sendApiError(res, error);
  }
}

/** POST /api/v1/merchants/payout-methods */
export async function postPayoutMethod(req: Request, res: Response) {
  const merchantId = requireMerchant(req, res);
  if (!merchantId) return;
  const parsed = createPayoutMethodSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationFailed(res, parsed.error.issues);
  try {
    res.status(201).json({ data: await createPayoutMethod(merchantId, parsed.data) });
  } catch (error) {
    sendApiError(res, error);
  }
}

/** DELETE /api/v1/merchants/payout-methods/:id — archives the method. */
export async function deletePayoutMethod(req: Request, res: Response) {
  const merchantId = requireMerchant(req, res);
  if (!merchantId) return;
  const parsed = payoutMethodIdParamSchema.safeParse(req.params);
  if (!parsed.success) return validationFailed(res, parsed.error.issues);
  try {
    res.json({ data: await archivePayoutMethod(merchantId, parsed.data.id) });
  } catch (error) {
    sendApiError(res, error);
  }
}
