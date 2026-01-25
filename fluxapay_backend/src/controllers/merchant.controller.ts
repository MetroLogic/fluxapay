import z from "zod";
import { createController } from "../helpers/controller.helper";
import * as merchantSchema from "../schemas/merchant.schema";
import {
  loginMerchantService,
  resendOtpMerchantService,
  signupMerchantService,
  verifyOtpMerchantService,
  getMerchantUserService,
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
