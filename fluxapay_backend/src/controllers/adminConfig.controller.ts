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
export async function patchAdminConfigHandler(req: AuthRequest, res: Response) {
  try {
    const adminId = req.adminUser?.id ?? req.user?.id ?? "admin";
    const body = req.body as Record<string, string>;

    const updates: Record<string, string> = {};
    for (const key of ADMIN_CONFIG_KEYS) {
      if (body[key] !== undefined) {
        updates[key] = String(body[key]);
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
