import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express";
import { AdminRole } from "../generated/client/client";
import { verifyAdminToken } from "../helpers/adminJwt.helper";

/**
 * Permission matrix for admin roles.
 *
 * support    – read-only: view KYC submissions, payments, audit logs
 * finance    – support permissions + write access to settlements, reconciliation
 * super_admin – all permissions
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly string[]> = {
  [AdminRole.support]: [
    "kyc:read",
    "payments:read",
    "audit:read",
    "merchants:read",
  ],
  [AdminRole.finance]: [
    "kyc:read",
    "payments:read",
    "audit:read",
    "merchants:read",
    "settlements:read",
    "settlements:write",
    "reconciliation:read",
    "reconciliation:write",
    "sweep:write",
  ],
  [AdminRole.super_admin]: [
    "kyc:read",
    "kyc:write",
    "payments:read",
    "audit:read",
    "merchants:read",
    "merchants:write",
    "settlements:read",
    "settlements:write",
    "reconciliation:read",
    "reconciliation:write",
    "sweep:write",
    "config:write",
  ],
};

export function hasPermission(role: AdminRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Middleware: authenticate admin JWT and attach adminUser to request.
 * Must be used before requireAdminRole.
 */
export function authenticateAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ message: "Admin token required" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyAdminToken(token);
    req.adminUser = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired admin token" });
  }
}

/**
 * Middleware factory: require a specific permission.
 * Must be used after authenticateAdmin.
 *
 * @example
 *   router.get('/settlements', authenticateAdmin, requireAdminRole('settlements:read'), handler)
 */
export function requireAdminRole(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.adminUser?.role;
    if (!role) {
      return res.status(401).json({ message: "Admin authentication required" });
    }
    if (!hasPermission(role, permission)) {
      return res.status(403).json({
        message: `Forbidden. Role '${role}' lacks permission '${permission}'.`,
      });
    }
    next();
  };
}
