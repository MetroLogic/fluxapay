import { Request } from "express";

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
