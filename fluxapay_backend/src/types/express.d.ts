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
    role: string;
  };
  merchantId?: string;
  requestId?: string;
}
