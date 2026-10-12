import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express";
import { AdminRole } from "../generated/client/client";
import { verifyAdminToken } from "../helpers/adminJwt.helper";

/**
 * Typed permission strings for admin RBAC.
 * Use these constants instead of raw strings so TypeScript catches typos.
 *
 * @example
 *   router.get('/settlements', authenticateAdmin, requireAdminRole(AdminPermission.SETTLEMENTS_READ), handler)
 */
export const AdminPermission = {
  KYC_READ:              "kyc:read",
  KYC_WRITE:             "kyc:write",
  PAYMENTS_READ:         "payments:read",
  AUDIT_READ:            "audit:read",
  MERCHANTS_READ:        "merchants:read",
  MERCHANTS_WRITE:       "merchants:write",
  SETTLEMENTS_READ:      "settlements:read",
  SETTLEMENTS_WRITE:     "settlements:write",
  RECONCILIATION_READ:   "reconciliation:read",
  RECONCILIATION_WRITE:  "reconciliation:write",
  SWEEP_WRITE:           "sweep:write",
  CONFIG_WRITE:          "config:write",
} as const;

export type AdminPermissionValue = typeof AdminPermission[keyof typeof AdminPermission];

/**
 * Permission matrix for admin roles.
 *
 * support     – read-only: view KYC submissions, payments, audit logs
 * finance     – support permissions + write access to settlements, reconciliation
 * super_admin – all permissions
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermissionValue[]> = {
  [AdminRole.support]: [
    AdminPermission.KYC_READ,
    AdminPermission.PAYMENTS_READ,
    AdminPermission.AUDIT_READ,
    AdminPermission.MERCHANTS_READ,
  ],
  [AdminRole.finance]: [
    AdminPermission.KYC_READ,
    AdminPermission.PAYMENTS_READ,
    AdminPermission.AUDIT_READ,
    AdminPermission.MERCHANTS_READ,
    AdminPermission.SETTLEMENTS_READ,
    AdminPermission.SETTLEMENTS_WRITE,
    AdminPermission.RECONCILIATION_READ,
    AdminPermission.RECONCILIATION_WRITE,
    AdminPermission.SWEEP_WRITE,
  ],
  [AdminRole.super_admin]: [
    AdminPermission.KYC_READ,
    AdminPermission.KYC_WRITE,
    AdminPermission.PAYMENTS_READ,
    AdminPermission.AUDIT_READ,
    AdminPermission.MERCHANTS_READ,
    AdminPermission.MERCHANTS_WRITE,
    AdminPermission.SETTLEMENTS_READ,
    AdminPermission.SETTLEMENTS_WRITE,
    AdminPermission.RECONCILIATION_READ,
    AdminPermission.RECONCILIATION_WRITE,
    AdminPermission.SWEEP_WRITE,
    AdminPermission.CONFIG_WRITE,
  ],
};

export function hasPermission(role: AdminRole, permission: AdminPermissionValue): boolean {
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
    return sendApiError(res, apiError(401, ErrorCode.ADMIN_TOKEN_REQUIRED, "Admin token required"));
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyAdminToken(token);
    req.adminUser = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    return sendApiError(res, apiError(401, ErrorCode.INVALID_ADMIN_TOKEN, "Invalid or expired admin token"));
  }
}

/**
 * Middleware factory: require a specific permission.
 * Must be used after authenticateAdmin.
 *
 * @example
 *   router.get('/settlements', authenticateAdmin, requireAdminRole(AdminPermission.SETTLEMENTS_READ), handler)
 */
export function requireAdminRole(permission: AdminPermissionValue) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.adminUser?.role;
    if (!role) {
      return sendApiError(res, apiError(401, ErrorCode.ADMIN_AUTH_REQUIRED, "Admin authentication required"));
    }
    if (!hasPermission(role, permission)) {
      return sendApiError(
        res,
        apiError(403, ErrorCode.FORBIDDEN, `Forbidden. Role '${role}' lacks permission '${permission}'.`),
      );
    }
    next();
  };
}
