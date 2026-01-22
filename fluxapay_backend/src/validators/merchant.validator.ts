// src/validators/merchant.validator.ts
import { z } from 'zod';

export const signupSchema = z.object({
  business_name: z.string()
    .min(2, 'Business name must be at least 2 characters')
    .max(100, 'Business name must not exceed 100 characters'),
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters'),
  phone_number: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
    .max(20, 'Phone number must not exceed 20 characters'),
  country: z.string()
    .min(2, 'Country code must be 2 characters')
    .max(2, 'Country code must be 2 characters'),
  settlement_currency: z.string()
    .length(3, 'Currency must be 3 characters (ISO 4217)'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[@$!%*?&]/, 'Password must contain at least one special character')
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export const verifyOTPSchema = z.object({
  merchant_id: z.string().uuid('Invalid merchant ID'),
  otp: z.string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d+$/, 'OTP must contain only numbers')
});

export const resendOTPSchema = z.object({
  merchant_id: z.string().uuid('Invalid merchant ID')
});