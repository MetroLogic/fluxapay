import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { AdminRole } from "../generated/client/client";

export interface AdminJwtPayload extends JwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
}

export function signAdminToken(
  adminId: string,
  email: string,
  role: AdminRole,
): string {
  const options: SignOptions = { expiresIn: 3600 }; // 1 hour
  return jwt.sign(
    { sub: adminId, email, role },
    process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET!,
    options,
  );
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  return jwt.verify(
    token,
    process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET!,
  ) as AdminJwtPayload;
}
