import { PrismaClient } from "../generated/client/client";
import bcrypt from "bcrypt";
import { createOtp, verifyOtp as verifyOtpService } from "./otp.service";
import { sendOtpEmail } from "./email.service";
import { isDevEnv } from "../helpers/env.helper";
import { generateToken } from "../helpers/jwt.helper";


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

  // Create merchant
  const merchant = await prisma.merchant.create({
    data: {
      business_name,
      email,
      phone_number,
      country,
      settlement_currency,
      password: hashedPassword,
    },
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


  return { message: "Merchant found", merchant };
}
