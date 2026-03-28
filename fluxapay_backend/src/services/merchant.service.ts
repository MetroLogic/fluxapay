import { PrismaClient, Prisma } from "../generated/client/client";
import {
  normalizeCheckoutAccentHex,
  normalizeCheckoutLogoUrl,
} from "../utils/checkout-branding.util";
import bcrypt from "bcrypt";
import { createOtp, verifyOtp as verifyOtpService } from "./otp.service";
import { sendOtpEmail } from "./email.service";
import { isDevEnv } from "../helpers/env.helper";
import { generateToken } from "../helpers/jwt.helper";
import { merchantRegistryService } from "./merchantRegistry.service";
import { generateApiKey, generateWebhookSecret, hashKey, getLastFour } from "../helpers/crypto.helper";
import * as crypto from "crypto";

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
  if (channel === "email") await sendOtpEmail(merchant.email, otp);

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

  return { message: "API key regenerated", apiKey };
}

export async function rotateApiKeyService(data: {
  merchantId: string;
}) {
  return regenerateApiKeyService(data); // Same logic as regenerate
}

export async function rotateWebhookSecretService(data: {
  merchantId: string;
}) {
  const { merchantId } = data;

  const webhookSecret = generateWebhookSecret();

  await prisma.merchant.update({
    where: { id: merchantId },
    data: { webhook_secret: webhookSecret },
  });

  return { message: "Webhook secret rotated", webhookSecret };
}

export async function updateMerchantProfileService(data: {
  merchantId: string;
  business_name?: string;
  email?: string;
  checkout_logo_url?: string | null;
  checkout_accent_color?: string | null;
  settlement_schedule?: "daily" | "weekly";
  settlement_day?: number;
}) {
  const { merchantId, ...rest } = data;

  if (rest.email) {
    const taken = await prisma.merchant.findFirst({
      where: { email: rest.email, id: { not: merchantId } },
    });
    if (taken) throw { status: 400, message: "Email already in use" };
  }

  const patch: Prisma.MerchantUpdateInput = {};

  if (rest.business_name !== undefined) {
    patch.business_name = rest.business_name;
  }
  if (rest.email !== undefined) {
    patch.email = rest.email;
  }
  if (rest.checkout_logo_url !== undefined) {
    patch.checkout_logo_url = normalizeCheckoutLogoUrl(
      rest.checkout_logo_url === null || rest.checkout_logo_url === ""
        ? null
        : rest.checkout_logo_url,
    );
  }
  if (rest.checkout_accent_color !== undefined) {
    patch.checkout_accent_color = normalizeCheckoutAccentHex(
      rest.checkout_accent_color === null ||
        rest.checkout_accent_color === ""
        ? null
        : rest.checkout_accent_color,
    );
  }
  if (rest.settlement_schedule !== undefined) {
    patch.settlement_schedule = rest.settlement_schedule;
    if (rest.settlement_schedule === "daily") {
      patch.settlement_day = null;
    } else if (rest.settlement_day !== undefined) {
      patch.settlement_day = rest.settlement_day;
    }
  } else if (rest.settlement_day !== undefined) {
    patch.settlement_day = rest.settlement_day;
  }

  const merchant = await prisma.merchant.update({
    where: { id: merchantId },
    data: patch,
  });
  return { message: "Profile updated", merchant };
}

export async function updateMerchantWebhookService(data: {
  merchantId: string;
  webhook_url: string;
}) {
  await prisma.merchant.update({
    where: { id: data.merchantId },
    data: { webhook_url: data.webhook_url },
  });
  return { message: "Webhook URL updated" };
}

export async function updateSettlementScheduleService(data: {
  merchantId: string;
  settlement_schedule: "daily" | "weekly";
  settlement_day?: number;
}) {
  await prisma.merchant.update({
    where: { id: data.merchantId },
    data: {
      settlement_schedule: data.settlement_schedule,
      settlement_day: data.settlement_day ?? null,
    },
  });
  return { message: "Settlement schedule updated" };
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
  const { merchantId, ...bank } = data;
  await prisma.bankAccount.upsert({
    where: { merchantId },
    create: { merchantId, ...bank },
    update: bank,
  });
  return { message: "Bank account saved" };
}
