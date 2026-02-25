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
  settlement_schedule: z.enum(['daily', 'weekly']).optional().default('daily'),
  settlement_day: z
    .number()
    .int()
    .min(0, 'settlement_day must be 0–6 (Sun–Sat)')
    .max(6, 'settlement_day must be 0–6 (Sun–Sat)')
    .optional(),
})
  .refine(
    (data) =>
      data.settlement_schedule !== 'weekly' || data.settlement_day !== undefined,
    {
      message: 'settlement_day is required when settlement_schedule is "weekly"',
      path: ['settlement_day'],
    },
  );

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

export const settlementScheduleSchema = z
  .object({
    settlement_schedule: z.enum(['daily', 'weekly']).optional().default('daily'),
    /**
     * Required when settlement_schedule === 'weekly'.
     * 0 = Sunday … 6 = Saturday (matches JS Date.getDay()).
     */
    settlement_day: z
      .number()
      .int()
      .min(0, 'settlement_day must be 0–6 (Sun–Sat)')
      .max(6, 'settlement_day must be 0–6 (Sun–Sat)')
      .optional(),
  })
  .refine(
    (data) =>
      data.settlement_schedule !== 'weekly' || data.settlement_day !== undefined,
    {
      message: 'settlement_day is required when settlement_schedule is "weekly"',
      path: ['settlement_day'],
    },
  );

export const updateSettlementScheduleSchema = settlementScheduleSchema.required({
  settlement_schedule: true,
});

export const bankAccountSchema = z.object({
  account_name: z.string().min(2, 'Account name is required'),
  account_number: z.string().min(5, 'Account number is required'),
  bank_name: z.string().min(2, 'Bank name is required'),
  bank_code: z.string().optional(),
  currency: z.string().min(3, 'Currency is required'),
  country: z.string().min(2, 'Country is required'),
});
