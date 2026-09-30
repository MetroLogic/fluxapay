import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { AuthRequest } from "../types/express";
import { getEnvConfig } from "../config/env.config";

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.toLowerCase()?.startsWith("bearer "))
    return sendApiError(res, apiError(401, ErrorCode.INVALID_TOKEN, "Invalid token format"));

  const token = authHeader?.split(" ")[1]; // Bearer TOKEN

  if (!token) return sendApiError(res, apiError(401, ErrorCode.TOKEN_MISSING, "Token missing"));

  try {
    const JWT_SECRET = getEnvConfig().JWT_SECRET;
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload & { id?: unknown; email?: unknown };
    const merchantId = typeof payload?.id === "string" && payload.id.trim().length > 0 ? payload.id.trim() : undefined;

    if (!merchantId) {
      return sendApiError(res, apiError(401, ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }

    req.user = {
      id: merchantId,
      ...(typeof payload?.email === "string" ? { email: payload.email } : {}),
    };
    req.merchantId = merchantId;
    next();
  } catch (_err) {
    return sendApiError(res, apiError(403, ErrorCode.INVALID_TOKEN, "Invalid or expired token"));
  }
}
