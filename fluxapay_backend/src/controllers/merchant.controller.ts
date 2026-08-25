import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import z from "zod";
import { MerchantStatus } from "../generated/client/client";
import { createController } from "../helpers/controller.helper";
import * as merchantSchema from "../schemas/merchant.schema";
import {
  loginMerchantService,
  resendOtpMerchantService,
  signupMerchantService,
  verifyOtpMerchantService,
  getMerchantUserService,
  updateMerchantProfileService,
  updateMerchantWebhookService,
  rotateApiKeyService,
  rotateWebhookSecretService,
  updateSettlementScheduleService,
  addBankAccountService,
  updateBankAccountService,
} from "../services/merchant.service";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../services/notificationPreferences.service";
import { AuthRequest } from "../types/express";
import { validateUserId } from "../helpers/request.helper";

type SignupRequest = z.infer<typeof merchantSchema.signupSchema>;
type LoginRequest = z.infer<typeof merchantSchema.loginSchema>;
type VerifyOtpRequest = z.infer<typeof merchantSchema.verifyOtpSchema>;
type ResendOtpRequest = z.infer<typeof merchantSchema.resendOtpSchema>;

export const signupMerchant = createController<SignupRequest>(
  signupMerchantService,
  201,
);

export const loginMerchant =
  createController<LoginRequest>(loginMerchantService);

export const verifyOtp = createController<VerifyOtpRequest>(
  verifyOtpMerchantService,
);

export const resendOtp = createController<ResendOtpRequest>(
  async (body, req) => {
    const ip: string | undefined =
      (req.ip) ||
      (req.socket?.remoteAddress) ||
      undefined;
    return resendOtpMerchantService({
      merchantId: body.merchantId,
      channel: body.channel,
      ip,
    });
  },
);

export const getLoggedInMerchant = createController(
  async (_, req: AuthRequest) => {
    const merchantId = await validateUserId(req);

    return getMerchantUserService({
      merchantId,
    });
  },
);

export const updateMerchantProfile = createController(
  async (body: Record<string, unknown>, req: AuthRequest) => {
    const merchantId = await validateUserId(req);
    const { params: _p, query: _q, ...profile } = body;

    return updateMerchantProfileService({
      merchantId,
      ...(profile as Omit<
        Parameters<typeof updateMerchantProfileService>[0],
        "merchantId"
      >),
    });
  },
);

export const updateMerchantWebhook = createController(
  async (body: { webhook_url: string }, req: AuthRequest) => {
    const merchantId = await validateUserId(req);

    return updateMerchantWebhookService({
      merchantId,
      webhook_url: body.webhook_url,
    });
  },
);

export const rotateApiKey = createController(async (_, req: AuthRequest) => {
  const merchantId = await validateUserId(req);
  return rotateApiKeyService({ merchantId });
});

export const rotateWebhookSecret = createController(
  async (_, req: AuthRequest) => {
    const merchantId = await validateUserId(req);
    return rotateWebhookSecretService({ merchantId });
  },
);

// ── Admin-only controllers ────────────────────────────────────────────────────

import { Request, Response } from "express";

import { prisma as adminPrisma } from "../prisma";

/**
 * Defense-in-depth admin gate. Mirrors the logic in adminAuth middleware so
 * handlers are safe even if mounted without the route-level middleware.
 *
 * Returns an error payload if the request is NOT authorised, or null if it is.
 * Callers should `return sendApiError(res, err)` when non-null.
 */
function assertAdminRequest(req: Request): ReturnType<typeof apiError> | null {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers["x-admin-secret"];

  if (!adminSecret) {
    if (process.env.NODE_ENV === "production") {
      return apiError(
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
        "Admin endpoints are disabled in production because ADMIN_SECRET is not configured.",
      );
    }
    // Dev fallthrough — allowed without a secret
    return null;
  }

  if (providedSecret !== adminSecret) {
    return apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized. Invalid or missing admin secret.");
  }

  return null;
}

/** GET /api/merchants/admin/list – paginated merchant list */
export async function adminListMerchants(req: Request, res: Response) {
  try {
    const denied = assertAdminRequest(req);
    if (denied) return sendApiError(res, denied);

    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));
    const status = req.query.status as string | undefined;

    const where = status ? { status: status as any } : {};

    const [merchants, total] = await Promise.all([
      adminPrisma.merchant.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          business_name: true,
          email: true,
          country: true,
          status: true,
          created_at: true,
          kyc: { select: { kyc_status: true } },
          _count: { select: { payments: true } },
        },
      }),
      adminPrisma.merchant.count({ where }),
    ]);

    res.json({ merchants, total, page, limit });
  } catch (err: any) {
    sendApiError(res, err);
  }
}

/** GET /api/merchants/admin/:merchantId – single merchant detail */
export async function adminGetMerchant(req: Request, res: Response) {
  try {
    const denied = assertAdminRequest(req);
    if (denied) return sendApiError(res, denied);

    const merchantId = String(req.params.merchantId);
    const merchant = await adminPrisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        kyc: true,
        _count: { select: { payments: true, settlements: true } },
      },
    });

    if (!merchant) return sendApiError(res, apiError(404, ErrorCode.MERCHANT_NOT_FOUND, "Merchant not found"));
    res.json({ merchant });
  } catch (err: any) {
    sendApiError(res, err);
  }
}

/** PATCH /api/merchants/admin/:merchantId/status – suspend / activate */
export async function adminUpdateMerchantStatus(req: Request, res: Response) {
  try {
    const denied = assertAdminRequest(req);
    if (denied) return sendApiError(res, denied);

    const merchantId = String(req.params.merchantId);
    const { status } = req.body as { status: MerchantStatus };

    if (!["active", "pending_verification"].includes(status)) {
      return sendApiError(res, apiError(400, ErrorCode.INVALID_STATUS_VALUE, "Invalid status value"));
    }

    const merchant = await adminPrisma.merchant.update({
      where: { id: merchantId },
      data: { status },
      select: { id: true, business_name: true, status: true },
    });

    res.json({ message: "Merchant status updated", merchant });
  } catch (err: any) {
    sendApiError(res, err);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/merchants/admin/bulk-status – bulk suspend / activate */
export async function adminBulkUpdateMerchantStatus(req: Request, res: Response) {
  try {
    const denied = assertAdminRequest(req);
    if (denied) return sendApiError(res, denied);

    const { merchantIds, status, reason } = req.body as {
      merchantIds: string[];
      status: MerchantStatus;
      reason: string;
    };

    if (!Array.isArray(merchantIds) || merchantIds.length === 0) {
      return sendApiError(res, apiError(400, ErrorCode.INVALID_MERCHANT_IDS, "merchantIds must be a non-empty array"));
    }

    // Validate UUID format before hitting the database
    const invalidIds = merchantIds.filter((id) => typeof id !== "string" || !UUID_REGEX.test(id));
    if (invalidIds.length > 0) {
      return sendApiError(
        res,
        apiError(400, ErrorCode.INVALID_MERCHANT_IDS, `Invalid merchant IDs: ${invalidIds.join(", ")}`),
      );
    }

    if (!["active", "suspended"].includes(status)) {
      return sendApiError(res, apiError(400, ErrorCode.INVALID_STATUS_VALUE, "status must be active or suspended"));
    }
    if (!reason || reason.trim().length < 3) {
      return sendApiError(res, apiError(400, ErrorCode.REASON_REQUIRED, "reason is required"));
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of merchantIds) {
      try {
        await adminPrisma.merchant.update({
          where: { id },
          data: { status },
          select: { id: true },
        });
        results.push({ id, success: true });
      } catch (err: any) {
        results.push({ id, success: false, error: err.message || "Update failed" });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);

    res.json({
      message: `${succeeded} of ${merchantIds.length} merchants updated`,
      results,
      succeeded,
      failed,
    });
  } catch (err: any) {
    sendApiError(res, err);
  }
}

/** PATCH /api/merchants/admin/:merchantId/webhook – update webhook URL */
export async function adminUpdateMerchantWebhook(req: Request, res: Response) {
  try {
    const denied = assertAdminRequest(req);
    if (denied) return sendApiError(res, denied);

    const merchantId = String(req.params.merchantId);
    const { webhook_url } = req.body as { webhook_url: string };

    if (typeof webhook_url !== "string") {
      return sendApiError(res, apiError(400, ErrorCode.INVALID_REQUEST_BODY, "webhook_url must be a string"));
    }

    const merchant = await adminPrisma.merchant.update({
      where: { id: merchantId },
      data: { webhook_url },
      select: { id: true, business_name: true, webhook_url: true },
    });

    res.json({ message: "Merchant webhook updated", merchant });
  } catch (err: any) {
    sendApiError(res, err);
  }
}
export const updateSettlementSchedule = createController(
  async (
    body: { settlement_schedule: "daily" | "weekly"; settlement_day?: number },
    req: AuthRequest,
  ) => {
    const merchantId = await validateUserId(req);

    return updateSettlementScheduleService({
      merchantId,
      settlement_schedule: body.settlement_schedule,
      settlement_day: body.settlement_day,
    });
  },
);

export const addBankAccount = createController(
  async (
    body: {
      account_name: string;
      account_number: string;
      bank_name: string;
      bank_code?: string;
      currency: string;
      country: string;
    },
    req: AuthRequest,
  ) => {
    const merchantId = await validateUserId(req);

    return addBankAccountService({
      merchantId,
      ...body,
    });
  },
  201,
);

export const updateBankAccount = createController(
  async (
    body: {
      account_name?: string;
      account_number?: string;
      bank_name?: string;
      bank_code?: string;
      currency?: string;
      country?: string;
    },
    req: AuthRequest,
  ) => {
    const merchantId = await validateUserId(req);

    return updateBankAccountService({
      merchantId,
      ...body,
    });
  },
);

// ── Notification preferences ──────────────────────────────────────────────────

export const getNotificationPreferencesController = createController(
  async (_, req: AuthRequest) => {
    const merchantId = await validateUserId(req);
    const preferences = await getNotificationPreferences(merchantId);
    return { preferences };
  },
);

export const updateNotificationPreferencesController = createController(
  async (
    body: { payment_expiry_reminder?: boolean; reminder_minutes_before?: number },
    req: AuthRequest,
  ) => {
    const merchantId = await validateUserId(req);
    const preferences = await updateNotificationPreferences({
      merchantId,
      payment_expiry_reminder: body.payment_expiry_reminder,
      reminder_minutes_before: body.reminder_minutes_before,
    });
    return { message: "Notification preferences updated", preferences };
  },
);
