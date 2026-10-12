import { Response } from "express";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { AuthRequest } from "../types/express";
import {
  ADMIN_CONFIG_KEYS,
  getAdminConfig,
  updateAdminConfig,
} from "../services/adminConfig.service";

/**
 * GET /api/v1/admin/config
 */
export async function getAdminConfigHandler(_req: AuthRequest, res: Response) {
  try {
    const config = await getAdminConfig();
    return res.status(200).json({ success: true, data: config });
  } catch (error: unknown) {
    console.error("Error fetching admin config:", error);
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to fetch config"));
  }
}

/**
 * PATCH /api/v1/admin/config
 */
/**
 * Per-key validation rules for numeric admin config fields.
 * Each entry defines the allowed range (inclusive) so that typos or
 * extreme values cannot silently break settlement calculations.
 */
const NUMERIC_CONFIG_RULES: Record<string, { min: number; max: number; integer?: boolean; label: string }> = {
  settlement_fee_percent:                { min: 0, max: 50,   label: "settlement_fee_percent must be a number between 0 and 50" },
  default_payment_expiry_minutes:        { min: 1, max: 1440, integer: true, label: "default_payment_expiry_minutes must be an integer between 1 and 1440" },
  webhook_max_retries:                   { min: 0, max: 20,   integer: true, label: "webhook_max_retries must be an integer between 0 and 20" },
  reconciliation_alert_threshold_percent: { min: 0, max: 100,  label: "reconciliation_alert_threshold_percent must be a number between 0 and 100" },
};

export async function patchAdminConfigHandler(req: AuthRequest, res: Response) {
  try {
    const adminId = req.adminUser?.id ?? req.user?.id ?? "admin";
    const body = req.body as Record<string, string>;

    const updates: Record<string, string> = {};
    for (const key of ADMIN_CONFIG_KEYS) {
      if (body[key] !== undefined) {
        const value = String(body[key]);

        // Validate numeric config keys
        const rule = NUMERIC_CONFIG_RULES[key];
        if (rule) {
          const num = parseFloat(value);
          if (isNaN(num) || num < rule.min || num > rule.max) {
            return sendApiError(
              res,
              apiError(400, ErrorCode.VALIDATION_ERROR, rule.label),
            );
          }
          if (rule.integer && !Number.isInteger(num)) {
            return sendApiError(
              res,
              apiError(400, ErrorCode.VALIDATION_ERROR, rule.label),
            );
          }
        }

        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return sendApiError(
        res,
        apiError(400, ErrorCode.VALIDATION_ERROR, "No valid config fields provided"),
      );
    }

    const config = await updateAdminConfig(adminId, updates);
    return res.status(200).json({ success: true, data: config });
  } catch (error: unknown) {
    console.error("Error updating admin config:", error);
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to update config"));
  }
}
