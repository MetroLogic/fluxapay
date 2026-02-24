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
  async (body: { business_name?: string; email?: string }, req: AuthRequest) => {
    const merchantId = await validateUserId(req);

    return updateMerchantProfileService({
      merchantId,
      ...body,
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