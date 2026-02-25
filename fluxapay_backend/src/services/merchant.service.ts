import { PrismaClient } from "../generated/client/client";
import bcrypt from "bcrypt";
import { createOtp, verifyOtp as verifyOtpService } from "./otp.service";
import { sendOtpEmail, sendWelcomeEmail } from "./email.service";
import { isDevEnv } from "../helpers/env.helper";
import { generateToken } from "../helpers/jwt.helper";
import { merchantRegistryService } from "./merchantRegistry.service";
import {
  generateApiKey,
  generateWebhookSecret,
  hashKey,
  getLastFour,
} from "../helpers/crypto.helper";

const prisma = new PrismaClient();

// Local generateApiKey removed to resolve conflict with import from crypto.helper

export async function signupMerchantService(data: {
  business_name: string;
  email: string;
  phone_number: string;
  country: string;
  settlement_currency: string;
  password: string;
  settlement_schedule?: "daily" | "weekly";
  settlement_day?: number;
}) {
  const {
    email,
    phone_number,
    password,
    business_name,
    country,
    settlement_currency,
    settlement_schedule,
    settlement_day,
  } = data;

  // Check duplicates
  const existing = await prisma.merchant.findFirst({
    where: { OR: [{ email }, { phone_number }] },
  });
  if (existing)
    throw { status: 400, message: "Email or phone already registered" };

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate API key and derive hashed + last-four for storage
  const rawApiKey = generateApiKey();
  const apiKeyHashed = await hashKey(rawApiKey);
  const apiKeyLastFour = getLastFour(rawApiKey);

  // Create merchant — never persist the raw key
  const merchant = await prisma.merchant.create({
    data: {
      business_name,
      email,
      phone_number,
      country,
      settlement_currency,
      password: hashedPassword,
      api_key_hashed: apiKeyHashed,
      api_key_last_four: apiKeyLastFour,
      settlement_schedule: settlement_schedule ?? "daily",
      settlement_day:
        settlement_schedule === "weekly" ? (settlement_day ?? null) : null,
    },
  });

  // On-chain registration (synchronous here to guarantee order before OTP)
  try {
    await merchantRegistryService.register_merchant(
      merchant.id,
      business_name,
      settlement_currency,
    );
  } catch (err) {
    if (isDevEnv()) {
      console.error(
        "Non-blocking error during on-chain merchant registration:",
        err,
      );
    }
    // Depending on exact requirements, we might want to throw or continue.
    // Phase 1 requirement says "persist to manual_intervention table", which is now
    // done inside register_merchant. We will continue and let them verify via OTP.
    // Alternatively, we could delay the welcome email entirely and prevent OTP.
    // For now, logging and continuing is the safest approach that doesn't halt DB creation.
  }

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
    apiKey: rawApiKey,
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
  const merchant = await prisma.merchant.update({
    where: { id: merchantId },
    data: { status: "active" },
    select: { email: true, business_name: true, api_key: true },
  });

  // Send welcome email (non-blocking)
  const dashboardUrl =
    process.env.DASHBOARD_URL || "https://dashboard.fluxapay.com";
  if (merchant.api_key) {
    sendWelcomeEmail(
      merchant.email,
      merchant.business_name,
      merchant.api_key,
      dashboardUrl,
    ).catch((err) => {
      if (isDevEnv()) {
        console.error("Non-blocking error sending welcome email:", err);
      }
    });
  }

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
  if (channel === "email") await sendOtpEmail(merchant.email, otp);

  return { message: "OTP resent" };
}

export async function getMerchantUserService(data: { merchantId: string }) {
  const { merchantId } = data;
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true,
      business_name: true,
      email: true,
      phone_number: true,
      country: true,
      settlement_currency: true,
      status: true,
      api_key_last_four: true,
      webhook_url: true,
      created_at: true,
      updated_at: true,
      settlement_schedule: true,
      settlement_day: true,
    },
  });

  if (!merchant) throw { status: 404, message: "Merchant not found" };

  // Build a masked display key; never expose the raw key
  const { api_key_last_four, ...rest } = merchant;
  const maskedKey = api_key_last_four
    ? `sk_live_****${api_key_last_four}`
    : null;

  return {
    message: "Merchant found",
    merchant: { ...rest, api_key_masked: maskedKey },
  };
}

export async function rotateApiKeyService(data: { merchantId: string }) {
  const { merchantId } = data;
  const rawKey = generateApiKey();
  const hashedKey = await hashKey(rawKey);
  const lastFour = getLastFour(rawKey);

  await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      api_key_hashed: hashedKey,
      api_key_last_four: lastFour,
    },
  });

  return {
    message:
      "API key rotated successfully. Store this key securely as it will not be shown again.",
    apiKey: rawKey,
  };
}

export async function rotateWebhookSecretService(data: { merchantId: string }) {
  const { merchantId } = data;
  const secret = generateWebhookSecret();

  await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      webhook_secret: secret,
    },
  });

  return {
    message:
      "Webhook secret rotated successfully. Store this secret securely as it will not be shown again.",
    webhookSecret: secret,
  };
}

export async function updateMerchantProfileService(data: {
  merchantId: string;
  business_name?: string;
  email?: string;
}) {
  const { merchantId, business_name, email } = data;

  // Check if email is being changed and if it's already taken
  if (email) {
    const existing = await prisma.merchant.findFirst({
      where: { email, id: { not: merchantId } },
    });
    if (existing) throw { status: 400, message: "Email already in use" };
  }

  const updateData: any = {};
  if (business_name) updateData.business_name = business_name;
  if (email) updateData.email = email;

  const merchant = await prisma.merchant.update({
    where: { id: merchantId },
    data: updateData,
  });

  return { message: "Profile updated successfully", merchant };
}

export async function updateMerchantWebhookService(data: {
  merchantId: string;
  webhook_url: string;
}) {
  const { merchantId, webhook_url } = data;

  // Validate webhook URL
  if (!webhook_url.startsWith("https://")) {
    throw { status: 400, message: "Webhook URL must use HTTPS" };
  }

  const merchant = await prisma.merchant.update({
    where: { id: merchantId },
    data: { webhook_url },
  });

  return { message: "Webhook URL updated successfully", merchant };
}

export async function regenerateApiKeyService(data: { merchantId: string }) {
  const { merchantId } = data;

  const rawKey = generateApiKey();
  const hashedKey = await hashKey(rawKey);
  const lastFour = getLastFour(rawKey);

  await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      api_key_hashed: hashedKey,
      api_key_last_four: lastFour,
    },
  });

  return {
    message:
      "API key regenerated successfully. Store this key securely as it will not be shown again.",
    apiKey: rawKey,
  };
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
  const {
    merchantId,
    account_name,
    account_number,
    bank_name,
    bank_code,
    currency,
    country,
  } = data;

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });
  if (!merchant) throw { status: 404, message: "Merchant not found" };

  const bankAccount = await prisma.bankAccount.upsert({
    where: { merchantId },
    create: {
      merchantId,
      account_name,
      account_number,
      bank_name,
      bank_code: bank_code ?? null,
      currency,
      country,
    },
    update: {
      account_name,
      account_number,
      bank_name,
      bank_code: bank_code ?? null,
      currency,
      country,
    },
  });

  return { message: "Bank account saved successfully", bankAccount };
}

export async function updateSettlementScheduleService(data: {
  merchantId: string;
  settlement_schedule: "daily" | "weekly";
  settlement_day?: number;
}) {
  const { merchantId, settlement_schedule, settlement_day } = data;

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });
  if (!merchant) throw { status: 404, message: "Merchant not found" };

  const updated = await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      settlement_schedule,
      // Clear settlement_day when switching back to daily
      settlement_day:
        settlement_schedule === "weekly" ? (settlement_day ?? null) : null,
    },
    select: {
      id: true,
      business_name: true,
      settlement_schedule: true,
      settlement_day: true,
    },
  });

  return {
    message: "Settlement schedule updated successfully",
    merchant: updated,
  };
}
