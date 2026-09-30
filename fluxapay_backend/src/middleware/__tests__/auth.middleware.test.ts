import jwt from "jsonwebtoken";
import { authenticateToken } from "../auth.middleware";
import { resetEnvConfig } from "../../config/env.config";

describe("authenticateToken", () => {
  const originalEnv = process.env;

  const setRequiredEnv = () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.ADMIN_JWT_SECRET = "test-admin-secret";
    process.env.FUNDER_SECRET_KEY = "test-key";
    process.env.USDC_ISSUER_PUBLIC_KEY = "test-issuer";
    process.env.MASTER_VAULT_SECRET_KEY = "test-vault";
    process.env.KMS_ENCRYPTED_MASTER_SEED = "encrypted-seed";
    process.env.CORS_ORIGINS = "http://localhost:3000";
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetEnvConfig();
    setRequiredEnv();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("allows a valid JWT with a valid merchant id", () => {
    const token = jwt.sign(
      { id: "merchant_123", email: "merchant@example.com" },
      process.env.JWT_SECRET!,
    );

    const req: any = {
      headers: { authorization: `Bearer ${token}` },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(req.user).toEqual({ id: "merchant_123", email: "merchant@example.com" });
    expect(req.merchantId).toBe("merchant_123");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects a valid JWT that is missing the merchant id", () => {
    const token = jwt.sign({ email: "merchant@example.com" }, process.env.JWT_SECRET!);

    const req: any = {
      headers: { authorization: `Bearer ${token}` },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED", message: "Unauthorized" }),
    );
  });

  it("rejects a valid JWT with an invalid merchant id type", () => {
    const token = jwt.sign({ id: 123456, email: "merchant@example.com" }, process.env.JWT_SECRET!);

    const req: any = {
      headers: { authorization: `Bearer ${token}` },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED", message: "Unauthorized" }),
    );
  });

  it("rejects malformed or expired JWTs", () => {
    const req: any = {
      headers: { authorization: "Bearer not-a-valid-token" },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_TOKEN", message: "Invalid or expired token" }),
    );
  });
});
