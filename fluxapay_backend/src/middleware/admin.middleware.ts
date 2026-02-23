import { Response, NextFunction } from "express";
import crypto from "crypto";
import { AuthRequest } from "../types/express";

export function authorizeAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const apiKey = req.headers["x-admin-api-key"];

  if (!apiKey || typeof apiKey !== "string") {
    return res.status(403).json({ message: "Admin API key required" });
  }

  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey) {
    return res.status(500).json({ message: "Admin API key not configured" });
  }

  const apiKeyBuffer = Buffer.from(apiKey);
  const expectedBuffer = Buffer.from(expectedKey);

  if (
    apiKeyBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(apiKeyBuffer, expectedBuffer)
  ) {
    return res.status(403).json({ message: "Invalid admin API key" });
  }

  next();
}
