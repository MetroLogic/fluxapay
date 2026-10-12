import { Request } from "express";
import { AdminRole } from "../generated/client/client";

export interface AuthRequest extends Request {
  user?: {
    id?: string;
    email?: string;
  };
  adminUser?: {
    id: string;
    email: string;
    role: AdminRole;
  };
  merchantId?: string;
  /**
   * True when the request was authenticated with a test-mode API key
   * (sk_test_/fpk_test_), false for live API keys, undefined for JWT auth.
   */
  isTestMode?: boolean;
  requestId?: string;
}
