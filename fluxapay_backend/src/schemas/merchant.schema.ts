import { z } from 'zod';
import { countryMap } from '../utils/country-map.util';

const allowedCountryCodes = countryMap.map(x => x.countryCode);
const allowedCountryCurrencies = countryMap.map(x => x.currencyCode);
export const signupSchema = z.object({
  business_name: z.string().min(2, 'Business name is required'),
  email: z.email('Invalid email address'),
  phone_number: z.string().min(7, 'Phone number is required'),
  country: z.string().min(2, 'Country is required').refine(val => allowedCountryCodes.includes(val), { message: 'Invalid country code' }),
  settlement_currency: z.string().min(3, 'Settlement currency is required').refine(val => allowedCountryCurrencies.includes(val), { message: 'Invalid country currency' }),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const verifyOtpSchema = z.object({
  merchantId: z.string(),
  channel: z.enum(['email', 'phone']),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const resendOtpSchema = z.object({
  merchantId: z.string(),
  channel: z.enum(['email', 'phone']),
});
