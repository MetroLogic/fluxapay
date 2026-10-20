import crypto from "crypto";
import { prisma } from "../../config/prisma";

let counter = 0;
/** Unique per process + file run + call, so concurrent Jest workers never collide. */
export function uniqueSuffix(): string {
  counter += 1;
  return `${process.pid}-${Date.now().toString(36)}-${counter}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function createTestMerchant(overrides: Record<string, any> = {}) {
  const s = uniqueSuffix();
  return prisma.merchant.create({
    data: {
      business_name: `Test Merchant ${s}`,
      email: `merchant-${s}@test.fluxapay.local`,
      phone_number: `+000${crypto.randomInt(1e9, 9e9)}${counter}`,
      country: "NG",
      settlement_currency: "NGN",
      webhook_secret: `whsec_${crypto.randomBytes(16).toString("hex")}`,
      password: "hashed-test-password",
      ...overrides,
    } as any,
  });
}

export async function createTestApiKey(merchantId: string, overrides: Record<string, any> = {}) {
  const raw = `fx_test_${crypto.randomBytes(24).toString("hex")}`;
  const record = await prisma.apiKey.create({
    data: {
      merchantId,
      name: `test-key-${uniqueSuffix()}`,
      key_hash: crypto.createHash("sha256").update(raw).digest("hex"),
      key_last_four: raw.slice(-4),
      environment: "test",
      ...overrides,
    } as any,
  });
  return { record, rawKey: raw };
}

export async function createTestPayment(merchantId: string, overrides: Record<string, any> = {}) {
  const s = uniqueSuffix();
  return prisma.payment.create({
    data: {
      merchantId,
      amount: 100,
      currency: "USD",
      customer_email: `customer-${s}@test.fluxapay.local`,
      metadata: {},
      expiration: new Date(Date.now() + 60 * 60 * 1000),
      checkout_url: `http://localhost:3001/pay/${s}`,
      ...overrides,
    } as any,
  });
}
