import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { AuthRequest } from "../types/express";

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
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload & { id?: string };
    req.user = { id: payload?.id, email: payload?.email };
    if (payload?.id) {
      req.merchantId = payload.id;
    }
    next();
  } catch (_err) {
    return sendApiError(res, apiError(403, ErrorCode.INVALID_TOKEN, "Invalid or expired token"));
  }
}
