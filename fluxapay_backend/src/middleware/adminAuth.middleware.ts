import { Request, Response, NextFunction } from "express";

/**
 * Middleware to protect admin-only routes using a pre-shared secret.
 * This is intended for internal/operator use.
 * 
 * Header: X-Admin-Secret
 * Env Var: ADMIN_SECRET
 */
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers["x-admin-secret"];

  if (!adminSecret) {
    // If secret is not configured, only allow in development
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({
        message: "Admin endpoints are disabled in production because ADMIN_SECRET is not configured.",
      });
    }
  } else {
    // Secret is configured, must match
    if (providedSecret !== adminSecret) {
      return res.status(401).json({
        message: "Unauthorized. Invalid or missing admin secret.",
      });
    }
  }

  next();
}
