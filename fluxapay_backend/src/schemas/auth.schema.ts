import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, "Refresh token is required"),
});

export const logoutSchema = z.object({
  refresh_token: z.string().min(1, "Refresh token is required"),
});

export const checkLockoutSchema = z.object({
  email: z.string().email("Invalid email address"),
});
