import { z } from "zod";

/**
 * Payout bank account validation (issue #1249).
 *
 * Each supported settlement country fixes its currency and the shape of the
 * account number, bank code and (where used) routing number, so malformed
 * details are rejected before anything is stored.
 */

export interface BankRules {
  currency: string;
  /** Regex for the normalized (digits/letters only) account number. */
  accountNumber: RegExp;
  accountNumberHint: string;
  bankCode?: { pattern: RegExp; hint: string; label: string };
  routingNumber?: { pattern: RegExp; hint: string; checksum?: (value: string) => boolean };
}

/** ABA routing number checksum (3-7-1 weighting, mod 10). */
export function isValidAbaRoutingNumber(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

export const SUPPORTED_PAYOUT_COUNTRIES: Record<string, BankRules> = {
  NG: {
    currency: "NGN",
    accountNumber: /^\d{10}$/,
    accountNumberHint: "a 10-digit NUBAN account number",
    bankCode: { pattern: /^(\d{3}|\d{5,6})$/, hint: "a 3, 5 or 6-digit CBN bank code", label: "bank_code" },
  },
  KE: {
    currency: "KES",
    accountNumber: /^\d{6,20}$/,
    accountNumberHint: "6–20 digits",
    bankCode: { pattern: /^\d{2,5}$/, hint: "a 2–5 digit bank/branch code", label: "bank_code" },
  },
  GH: {
    currency: "GHS",
    accountNumber: /^\d{10,16}$/,
    accountNumberHint: "10–16 digits",
    bankCode: { pattern: /^\d{6}$/, hint: "a 6-digit bank sort code", label: "bank_code" },
  },
  ZA: {
    currency: "ZAR",
    accountNumber: /^\d{9,11}$/,
    accountNumberHint: "9–11 digits",
    bankCode: { pattern: /^\d{6}$/, hint: "a 6-digit universal branch code", label: "bank_code" },
  },
  US: {
    currency: "USD",
    accountNumber: /^\d{4,17}$/,
    accountNumberHint: "4–17 digits",
    routingNumber: {
      pattern: /^\d{9}$/,
      hint: "a valid 9-digit ABA routing number",
      checksum: isValidAbaRoutingNumber,
    },
  },
  GB: {
    currency: "GBP",
    accountNumber: /^\d{8}$/,
    accountNumberHint: "an 8-digit account number",
    bankCode: { pattern: /^\d{6}$/, hint: "a 6-digit sort code", label: "bank_code (sort code)" },
  },
};

/** Strip spaces and dashes people commonly type into bank numbers. */
export function normalizeBankNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

const beneficiaryName = z
  .string()
  .trim()
  .min(2, "beneficiary_name must be at least 2 characters")
  .max(100, "beneficiary_name must be at most 100 characters")
  .regex(/^[\p{L}][\p{L}\p{M} .,'&()-]*$/u, "beneficiary_name contains unsupported characters");

export const createPayoutMethodSchema = z
  .object({
    type: z.literal("bank_account").default("bank_account"),
    country: z
      .string()
      .trim()
      .transform((c) => c.toUpperCase())
      .refine((c) => c in SUPPORTED_PAYOUT_COUNTRIES, {
        message: `country must be one of ${Object.keys(SUPPORTED_PAYOUT_COUNTRIES).join(", ")}`,
      }),
    currency: z
      .string()
      .trim()
      .transform((c) => c.toUpperCase())
      .optional(),
    beneficiary_name: beneficiaryName,
    account_number: z.string().trim().min(1, "account_number is required").transform(normalizeBankNumber),
    bank_code: z.string().trim().transform(normalizeBankNumber).optional(),
    routing_number: z.string().trim().transform(normalizeBankNumber).optional(),
    bank_name: z.string().trim().min(2).max(100).optional(),
    label: z.string().trim().max(60).optional(),
    is_default: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const rules = SUPPORTED_PAYOUT_COUNTRIES[data.country];
    if (!rules) return; // already reported by the country refinement

    if (data.currency && data.currency !== rules.currency) {
      ctx.addIssue({
        code: "custom",
        path: ["currency"],
        message: `${data.country} payouts settle in ${rules.currency}, not ${data.currency}`,
      });
    }
    if (!rules.accountNumber.test(data.account_number)) {
      ctx.addIssue({
        code: "custom",
        path: ["account_number"],
        message: `account_number for ${data.country} must be ${rules.accountNumberHint}`,
      });
    }
    if (rules.bankCode) {
      if (!data.bank_code) {
        ctx.addIssue({ code: "custom", path: ["bank_code"], message: `${rules.bankCode.label} is required for ${data.country}` });
      } else if (!rules.bankCode.pattern.test(data.bank_code)) {
        ctx.addIssue({ code: "custom", path: ["bank_code"], message: `${rules.bankCode.label} must be ${rules.bankCode.hint}` });
      }
    }
    if (rules.routingNumber) {
      const routing = data.routing_number;
      if (!routing) {
        ctx.addIssue({ code: "custom", path: ["routing_number"], message: `routing_number is required for ${data.country}` });
      } else if (
        !rules.routingNumber.pattern.test(routing) ||
        (rules.routingNumber.checksum && !rules.routingNumber.checksum(routing))
      ) {
        ctx.addIssue({ code: "custom", path: ["routing_number"], message: `routing_number must be ${rules.routingNumber.hint}` });
      }
    } else if (data.routing_number) {
      ctx.addIssue({ code: "custom", path: ["routing_number"], message: `routing_number is not used for ${data.country}` });
    }
  });

export type CreatePayoutMethodInput = z.infer<typeof createPayoutMethodSchema>;

export const payoutMethodIdParamSchema = z.object({
  id: z.string().trim().min(1, "id is required"),
});
