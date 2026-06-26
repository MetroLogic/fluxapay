import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { createController } from "../helpers/controller.helper";
import {
  loginWithEmailPassword,
  refreshAccessToken,
  logout as logoutService,
  logoutAll as logoutAllService,
  checkAccountLockout,
} from "../services/auth.service";
import { AuthRequest } from "../types/express";
import { Request } from "express";

export const login = createController(async (body: any, req: Request) => {
  const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  
  return loginWithEmailPassword({
    email: body.email,
    password: body.password,
    ipAddress,
    userAgent,
  });
});

export const refresh = createController(async (body: any, req: Request) => {
  const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  
  return refreshAccessToken({
    refreshToken: body.refresh_token,
    ipAddress,
    userAgent,
  });
});

export const logout = createController(async (body: any) => {
  return logoutService({
    refreshToken: body.refresh_token,
  });
});

export const logoutAll = createController(async (_: any, req: AuthRequest) => {
  // This endpoint requires authentication
  const merchantId = req.merchantId || req.user?.id;
  if (!merchantId) {
    throw apiError(401, ErrorCode.AUTHENTICATION_REQUIRED, "Authentication required");
  }
  
  return logoutAllService({ merchantId });
});

export const checkLockoutStatus = createController(async (body: any) => {
  return checkAccountLockout(body.email);
});
