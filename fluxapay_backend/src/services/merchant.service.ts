import { PrismaClient, Prisma } from "../generated/client/client";
import {
  normalizeCheckoutAccentHex,
  normalizeCheckoutLogoUrl,
} from "../utils/checkout-branding.util";
import bcrypt from "bcrypt";
import { createOtp, verifyOtp as verifyOtpService } from "./otp.service";
import { sendOtpEmail } from "./email.service";
import { sendMerchantOtpSms } from "./smsOtp.service";
import { isDevEnv } from "../helpers/env.helper";
import { generateToken } from "../helpers/jwt.helper";
import { merchantRegistryService } from "./merchantRegistry.service";
import { generateApiKey, generateWebhookSecret, hashKey, getLastFour } from "../helpers/crypto.helper";
import * as crypto from "crypto";
import {
  logMerchantProfileUpdate,
  logBankAccountChange,
  logApiKeyRotation,
  logWebhookSecretRotation,
} from "./audit.service";

const prisma = new PrismaClient();

export async function signupMerchantService(data: {
  business_name: string;
  email: string;
  phone_number: string;
  country: string;
  settlement_currency: string;
  password: string;
}) {
  const {
    email,
    phone_number,
    password,
    business_name,
    country,
    settlement_currency,
  } = data;

  // Check duplicates
  const existing = await prisma.merchant.findFirst({
    where: { OR: [{ email }, { phone_number }] },
  });
  if (existing)
    throw { status: 400, message: "Email or phone already registered" };

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate API key
  const apiKey = generateApiKey();
  const apiKeyHashed = await hashKey(apiKey);
  const apiKeyLastFour = getLastFour(apiKey);

  // Create merchant
  const merchant = await prisma.merchant.create({
    data: {
      business_name,
      email,
      phone_number,
      country,
      settlement_currency,
      webhook_secret: crypto.randomBytes(32).toString("hex"),
      password: hashedPassword,
      api_key_hashed: apiKeyHashed,
      api_key_last_four: apiKeyLastFour,
    },
  });

  // On-chain registration (non-blocking)
  merchantRegistryService.register_merchant(merchant.id, business_name, settlement_currency).catch(err => {
    if (isDevEnv()) {
      console.error("Non-blocking error during on-chain merchant registration:", err);
    }
  });

  // Generate OTP
  try {
    const otp = await createOtp(merchant.id, "email");
    await sendOtpEmail(email, otp);
  } catch (err) {
    if (isDevEnv()) {
      console.log("err sending mail", err);
    }
    throw err;
  }

  return {
    message: "Merchant registered. Verify OTP to activate.",
    merchantId: merchant.id,
    apiKey,
  };
}

export async function loginMerchantService(data: {
  email: string;
  password: string;
}) {
  const { email, password } = data;
  const merchant = await prisma.merchant.findUnique({ where: { email } });

  if (!merchant) throw { status: 400, message: "Invalid credentials" };
  if (merchant.status !== "active")
    throw { status: 403, message: "Account not verified" };

  const match = await bcrypt.compare(password, merchant.password);
  if (!match) throw { status: 400, message: "Invalid credentials" };
  //   jwt sign
  const { token } = generateToken(merchant.id, merchant.email);
  return { message: "Login successful", merchantId: merchant.id, token };
}

export async function verifyOtpMerchantService(data: {
  merchantId: string;
  channel: "email" | "phone";
  otp: string;
}) {
  const { merchantId, channel, otp } = data;

  const { success, message } = await verifyOtpService(merchantId, channel, otp);
  if (!success) throw { status: 400, message };

  // Activate merchant
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { status: "active" },
  });

  return { message: "Merchant verified and activated" };
}

export async function resendOtpMerchantService(data: {
  merchantId: string;
  channel: "email" | "phone";
}) {
  const { merchantId, channel } = data;
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });

  if (!merchant) throw { status: 404, message: "Merchant not found" };


  const otp = await createOtp(merchantId, channel);
  if (channel === "email") {
    await sendOtpEmail(merchant.email, otp);
  } else {
    await sendMerchantOtpSms(merchantId, merchant.phone_number, otp);
  }

  return { message: "OTP resent" };
}

export async function getMerchantUserService(data: {
  merchantId: string;
}) {
  const { merchantId } = data;
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });

  if (!merchant) throw { status: 404, message: "Merchant not found" };

  const { api_key_hashed, api_key_last_four, ...merchantData } = merchant;
  const apiKeyMasked = merchant.api_key_last_four ? `sk_live_****${merchant.api_key_last_four}` : null;

  return {
    message: "Merchant found",
    merchant: {
      ...merchantData,
      api_key_masked: apiKeyMasked,
    }
  };
}

export async function regenerateApiKeyService(data: {
  merchantId: string;
}) {
  const { merchantId } = data;

  const apiKey = generateApiKey();
  const apiKeyHashed = await hashKey(apiKey);
  const apiKeyLastFour = getLastFour(apiKey);

  await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      api_key_hashed: apiKeyHashed,
      api_key_last_four: apiKeyLastFour,
    },
  });

  // Audit log: API key rotation
  logApiKeyRotation({ merchantId, lastFour: apiKeyLastFour }).catch(() => {});

  return { message: "API key regenerated", apiKey };
}

export async function rotateApiKeyService(data: {
  merchantId: string;
}) {
  return regenerateApiKeyService(data); // Same logic as regenerate
}

export async function updateMerchantProfileService(data: {
  merchantId: string;
  business_name?: string;
  email?: string;
}) {
  const { merchantId, ...updateData } = data;

  // Fetch old values for audit log
  const existing = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { business_name: true, email: true },
  });

  const merchant = await prisma.merchant.update({
    where: { id: merchantId },
    data: updateData,
  });

  // Audit log: profile change
  if (existing) {
    const changedFields = Object.keys(updateData).filter(
      (k) => (updateData as any)[k] !== (existing as any)[k],
    );
    if (changedFields.length > 0) {
      const oldValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      for (const field of changedFields) {
        oldValues[field] = (existing as any)[field];
        newValues[field] = (updateData as any)[field];
      }
      logMerchantProfileUpdate({ merchantId, changedFields, oldValues, newValues }).catch(() => {});
    }
  }

  return { message: "Profile updated", merchant };
}

export async function updateMerchantWebhookService(data: {
  merchantId: string;
  webhook_url: string;
}) {
  const { merchantId, webhook_url } = data;
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { webhook_url },
  });
  return { message: "Webhook URL updated", webhook_url };
}

export async function rotateWebhookSecretService(data: {
  merchantId: string;
}) {
  const { merchantId } = data;
  const newSecret = crypto.randomBytes(32).toString("hex");
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { webhook_secret: newSecret },
  });

  // Audit log: webhook secret rotation (value is never logged)
  logWebhookSecretRotation({ merchantId }).catch(() => {});

  return { message: "Webhook secret rotated", webhook_secret: newSecret };
}

export async function updateSettlementScheduleService(data: {
  merchantId: string;
  settlement_schedule: "daily" | "weekly";
  settlement_day?: number;
}) {
  const { merchantId, settlement_schedule, settlement_day } = data;
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { settlement_schedule, settlement_day },
  });
  return { message: "Settlement schedule updated", settlement_schedule, settlement_day };
}

export async function addBankAccountService(data: {
  merchantId: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  bank_code?: string;
  currency: string;
  country: string;
}) {
  const { merchantId, ...bankData } = data;

  // Fetch existing bank account for audit diff
  const existing = await prisma.bankAccount.findUnique({
    where: { merchantId },
  });

  const bankAccount = await prisma.bankAccount.upsert({
    where: { merchantId },
    create: { merchantId, ...bankData },
    update: bankData,
  });

  // Audit log: bank account created or updated
  const action = existing ? "updated" : "created";
  const changedFields = existing
    ? Object.keys(bankData).filter((k) => (bankData as any)[k] !== (existing as any)[k])
    : Object.keys(bankData);

  const oldValues: Record<string, any> = {};
  const newValues: Record<string, any> = {};
  for (const field of changedFields) {
    oldValues[field] = existing ? (existing as any)[field] : null;
    // Mask account number in audit log
    newValues[field] = field === "account_number"
      ? `****${String((bankData as any)[field]).slice(-4)}`
      : (bankData as any)[field];
  }

  logBankAccountChange({ merchantId, action, changedFields, oldValues, newValues }).catch(() => {});

  return { message: "Bank account updated", bankAccount };
}
