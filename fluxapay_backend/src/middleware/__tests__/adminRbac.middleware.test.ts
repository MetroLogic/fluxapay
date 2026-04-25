import { AdminRole } from "../../generated/client/client";
import {
  ROLE_PERMISSIONS,
  hasPermission,
  authenticateAdmin,
  requireAdminRole,
} from "../adminRbac.middleware";
import { signAdminToken } from "../../helpers/adminJwt.helper";

// Ensure JWT_SECRET is set for tests
process.env.JWT_SECRET = "test-secret-key";

const mockRes = () => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
};

const mockNext = jest.fn();

describe("ROLE_PERMISSIONS matrix", () => {
  it("support can read KYC, payments, audit, merchants", () => {
    expect(hasPermission(AdminRole.support, "kyc:read")).toBe(true);
    expect(hasPermission(AdminRole.support, "payments:read")).toBe(true);
    expect(hasPermission(AdminRole.support, "audit:read")).toBe(true);
    expect(hasPermission(AdminRole.support, "merchants:read")).toBe(true);
  });

  it("support cannot write settlements or trigger sweeps", () => {
    expect(hasPermission(AdminRole.support, "settlements:write")).toBe(false);
    expect(hasPermission(AdminRole.support, "sweep:write")).toBe(false);
    expect(hasPermission(AdminRole.support, "config:write")).toBe(false);
  });

  it("finance can read and write settlements and reconciliation", () => {
    expect(hasPermission(AdminRole.finance, "settlements:read")).toBe(true);
    expect(hasPermission(AdminRole.finance, "settlements:write")).toBe(true);
    expect(hasPermission(AdminRole.finance, "reconciliation:write")).toBe(true);
    expect(hasPermission(AdminRole.finance, "sweep:write")).toBe(true);
  });

  it("finance cannot write config", () => {
    expect(hasPermission(AdminRole.finance, "config:write")).toBe(false);
    expect(hasPermission(AdminRole.finance, "kyc:write")).toBe(false);
  });

  it("super_admin has all permissions", () => {
    const allPerms = new Set(Object.values(ROLE_PERMISSIONS).flat());
    allPerms.forEach((perm) => {
      expect(hasPermission(AdminRole.super_admin, perm)).toBe(true);
    });
  });
});

describe("authenticateAdmin middleware", () => {
  beforeEach(() => mockNext.mockClear());

  it("rejects missing Authorization header", () => {
    const req: any = { headers: {} };
    const res = mockRes();
    authenticateAdmin(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("rejects invalid token", () => {
    const req: any = { headers: { authorization: "Bearer bad.token.here" } };
    const res = mockRes();
    authenticateAdmin(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("attaches adminUser and calls next for valid token", () => {
    const token = signAdminToken("admin-1", "ops@fluxapay.com", AdminRole.support);
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    authenticateAdmin(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.adminUser).toMatchObject({
      id: "admin-1",
      email: "ops@fluxapay.com",
      role: AdminRole.support,
    });
  });
});

describe("requireAdminRole middleware", () => {
  beforeEach(() => mockNext.mockClear());

  it("returns 401 when adminUser is not set", () => {
    const req: any = { headers: {} };
    const res = mockRes();
    requireAdminRole("settlements:write")(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 403 when role lacks permission", () => {
    const req: any = { adminUser: { id: "a1", email: "x@x.com", role: AdminRole.support } };
    const res = mockRes();
    requireAdminRole("settlements:write")(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("calls next when role has permission", () => {
    const req: any = { adminUser: { id: "a1", email: "x@x.com", role: AdminRole.finance } };
    const res = mockRes();
    requireAdminRole("settlements:write")(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("super_admin passes any permission check", () => {
    const req: any = { adminUser: { id: "a1", email: "x@x.com", role: AdminRole.super_admin } };
    const res = mockRes();
    requireAdminRole("config:write")(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
