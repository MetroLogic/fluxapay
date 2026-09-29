import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { AdminRole } from "../generated/client/client";

export interface AdminJwtPayload extends JwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
}

/**
 * Returns the dedicated admin JWT secret. Deliberately never falls back to
 * JWT_SECRET or any hardcoded default — env.config.ts's zod schema already
 * requires ADMIN_JWT_SECRET and fails the process at startup if it's unset,
 * but this throws too as defense-in-depth for any call path that reads
 * process.env directly without going through that validation first.
 */
function getAdminJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_JWT_SECRET is not set. Refusing to sign/verify admin tokens " +
      "with a fallback or default secret — set ADMIN_JWT_SECRET explicitly.",
    );
  }
  return secret;
}

export function signAdminToken(
  adminId: string,
  email: string,
  role: AdminRole,
): string {
  const options: SignOptions = { expiresIn: 3600 }; // 1 hour
  return jwt.sign(
    { sub: adminId, email, role },
    getAdminJwtSecret(),
    options,
  );
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  return jwt.verify(token, getAdminJwtSecret()) as AdminJwtPayload;
}
