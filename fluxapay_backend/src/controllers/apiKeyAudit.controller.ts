import { Request, Response } from "express";
import { z } from "zod";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { AuthRequest } from "../types/express";
import { listApiKeyAuditLogs } from "../services/apiKeyAudit.service";

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  action: z.enum(["created", "updated", "rotated", "revoked", "regenerated"]).optional(),
  api_key_id: z.string().trim().min(1).optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional(),
});

async function respondWithAuditLogs(req: Request, res: Response, merchantId: string) {
  const parsed = auditLogQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendApiError(
      res,
      apiError(400, ErrorCode.VALIDATION_ERROR, "Validation failed", {
        errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      }),
    );
  }
  try {
    const result = await listApiKeyAuditLogs(merchantId, {
      page: parsed.data.page,
      limit: parsed.data.limit,
      action: parsed.data.action,
      apiKeyId: parsed.data.api_key_id,
      from: parsed.data.date_from,
      to: parsed.data.date_to,
    });
    return res.json(result);
  } catch (error) {
    return sendApiError(res, error);
  }
}

/**
 * GET /api/v1/merchants/audit-logs — the merchant owner's API key audit trail.
 *
 * Restricted to the account owner's dashboard session (JWT): an API key must
 * not be able to read the history of the keys themselves.
 */
export async function getMerchantAuditLogs(req: Request, res: Response) {
  const authReq = req as AuthRequest;
  if (!authReq.merchantId) {
    return sendApiError(res, apiError(401, ErrorCode.AUTHENTICATION_REQUIRED, "Authentication required"));
  }
  if (!authReq.user?.id) {
    return sendApiError(
      res,
      apiError(403, ErrorCode.FORBIDDEN, "Audit logs are only available to the account owner's dashboard session"),
    );
  }
  return respondWithAuditLogs(req, res, authReq.merchantId);
}

/** GET /api/v1/merchants/admin/:merchantId/audit-logs — platform admins. */
export async function adminGetMerchantAuditLogs(req: Request, res: Response) {
  return respondWithAuditLogs(req, res, String(req.params.merchantId));
}
