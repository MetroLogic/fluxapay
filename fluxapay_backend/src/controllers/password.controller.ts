import { Request } from "express";
import { createController } from "../helpers/controller.helper";
import { sendApiError, apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";

export const forgotPassword = createController(async (body: any, req: Request) => {
  // Delegate to existing OTP/email services if any — minimal stub to satisfy routes
  const email = body.email;
  if (!email) throw apiError(400, ErrorCode.INVALID_REQUEST_BODY, "Email is required");

  // In real implementation this would enqueue email/send reset token
  return { message: "If the email exists, a password reset link has been sent." };
});

export const validateResetToken = createController(async (body: any) => {
  const token = body.token || (body as any).query?.token;
  if (!token) throw apiError(400, ErrorCode.INVALID_REQUEST_BODY, "Token is required");
  // Minimal stub — real implementation would validate token
  return { valid: true };
});

export const resetPassword = createController(async (body: any) => {
  const token = body.token;
  const password = body.password;
  if (!token || !password) throw apiError(400, ErrorCode.INVALID_REQUEST_BODY, "Token and password required");
  // Minimal stub — real implementation would validate token and reset password
  return { message: "Password reset successful" };
});
