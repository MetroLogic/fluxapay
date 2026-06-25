import jwt, { SignOptions, JwtPayload } from "jsonwebtoken";
import crypto from "crypto";

export interface AccessTokenPayload extends JwtPayload {
  id: string;
  email: string;
  role?: string;
  iat: number;
  exp: number;
}

/**
 * Generate a short-lived access token (15 minutes)
 */
export const generateAccessToken = (merchantId: string, email: string, role: string = "merchant"): string => {
  const options: SignOptions = {
    expiresIn: "15m", // 15 minutes as per requirements
  };
  const payload: AccessTokenPayload = {
    id: merchantId,
    email,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes from now
  };
  return jwt.sign(payload, process.env.JWT_SECRET!, options);
};

/**
 * Generate a cryptographically secure opaque refresh token
 * Returns the plain token (to be sent to client) and the hash (to be stored in DB)
 */
export const generateRefreshTokenPair = (): { token: string; hash: string } => {
  const token = crypto.randomBytes(32).toString("hex");
  // Hash with bcrypt cost 12 (done at service level for consistency with password hashing)
  return { token, hash: token }; // Hash will be computed with bcrypt in service
};

/**
 * Verify and decode an access token
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, process.env.JWT_SECRET!) as AccessTokenPayload;
};

/**
 * Legacy function for backward compatibility - now uses short-lived access token
 * @deprecated Use generateAccessToken instead
 */
export const generateToken = (merchantId: string, email: string) => {
  const token = generateAccessToken(merchantId, email);
  return { token };
};
