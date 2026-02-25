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
    return res.status(401).json({ message: "Invalid token format" });

  const token = authHeader?.split(" ")[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ message: "Token missing" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = { id: payload?.id, email: payload?.email }; // attach payload to request for later use
    next();
  } catch (_err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}
