import z from "zod";
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
} from "../services/merchant.service";
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
  resendOtpMerchantService,
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
import { PrismaClient } from "../generated/client/client";

const adminPrisma = new PrismaClient();

/** GET /api/merchants/admin/list – paginated merchant list */
export async function adminListMerchants(req: Request, res: Response) {
  try {
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
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/** GET /api/merchants/admin/:merchantId – single merchant detail */
export async function adminGetMerchant(req: Request, res: Response) {
  try {
    const merchantId = String(req.params.merchantId);
    const merchant = await adminPrisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        kyc: true,
        _count: { select: { payments: true, settlements: true } },
      },
    });

    if (!merchant) return res.status(404).json({ message: "Merchant not found" });
    res.json({ merchant });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/** PATCH /api/merchants/admin/:merchantId/status – suspend / activate */
export async function adminUpdateMerchantStatus(req: Request, res: Response) {
  try {
    const merchantId = String(req.params.merchantId);
    const { status } = req.body;

    if (!["active", "pending_verification"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const merchant = await adminPrisma.merchant.update({
      where: { id: merchantId },
      data: { status },
      select: { id: true, business_name: true, status: true },
    });

    res.json({ message: "Merchant status updated", merchant });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/** POST /api/merchants/admin/bulk-status – bulk suspend / activate */
export async function adminBulkUpdateMerchantStatus(req: Request, res: Response) {
  try {
    const { merchantIds, status, reason } = req.body as {
      merchantIds: string[];
      status: string;
      reason: string;
    };

    if (!Array.isArray(merchantIds) || merchantIds.length === 0) {
      return res.status(400).json({ message: "merchantIds must be a non-empty array" });
    }
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ message: "status must be active or suspended" });
    }
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ message: "reason is required" });
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
    res.status(500).json({ message: err.message || "Server error" });
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
