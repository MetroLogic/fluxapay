import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { PrismaClient, Prisma } from "../generated/client/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug = "";
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

export async function createPaymentLinkService(params: {
  merchantId: string;
  title: string;
  description?: string;
  amount?: number;
  currency: string;
  redirect_url?: string;
  expiry?: string;
  metadata?: Record<string, unknown>;
  customer_id?: string;
}) {
  const { merchantId, title, description, amount, currency, redirect_url, expiry, metadata, customer_id } = params;

  // Validate metadata max 10 pairs
  if (metadata && Object.keys(metadata).length > 10) {
    throw apiError(400, ErrorCode.INVALID_METADATA, "Metadata cannot exceed 10 key-value pairs");
  }

  // Generate unique slug
  let slug = generateSlug();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await prisma.paymentLink.findUnique({ where: { slug } });
    if (!existing) break;
    slug = generateSlug();
    attempts++;
  }

  const paymentLink = await prisma.paymentLink.create({
    data: {
      merchantId,
      slug,
      title,
      description,
      amount: amount ? Math.floor(amount * 100) : null,
      currency,
      redirect_url,
      expiry: expiry ? new Date(expiry) : null,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      customerId: customer_id,
    },
  });

  const checkoutBase = process.env.PAY_CHECKOUT_BASE || process.env.BASE_URL || "http://localhost:3000";
  const shortUrl = `${checkoutBase.replace(/\/$/, "")}/pay/${slug}`;

  return {
    id: paymentLink.id,
    slug: paymentLink.slug,
    title: paymentLink.title,
    description: paymentLink.description,
    amount: paymentLink.amount ? Number(paymentLink.amount) / 100 : null,
    currency: paymentLink.currency,
    redirect_url: paymentLink.redirect_url,
    expiry: paymentLink.expiry,
    active: paymentLink.active,
    metadata: paymentLink.metadata,
    short_url: shortUrl,
    total_payments: paymentLink.total_payments,
    total_volume: paymentLink.total_volume ? Number(paymentLink.total_volume) / 100 : 0,
    created_at: paymentLink.created_at,
  };
}

export async function getPaymentLinkByIdService(params: { merchantId: string; id: string }) {
  const { merchantId, id } = params;

  const paymentLink = await prisma.paymentLink.findFirst({
    where: { id, merchantId },
    include: {
      customer: true,
    },
  });

  if (!paymentLink) {
    throw apiError(404, ErrorCode.PAYMENT_LINK_NOT_FOUND, "Payment link not found");
  }

  // Check if expired
  if (paymentLink.expiry && paymentLink.expiry < new Date()) {
    return {
      ...paymentLink,
      active: false,
      expired: true,
    };
  }

  return {
    id: paymentLink.id,
    slug: paymentLink.slug,
    title: paymentLink.title,
    description: paymentLink.description,
    amount: paymentLink.amount ? Number(paymentLink.amount) / 100 : null,
    currency: paymentLink.currency,
    redirect_url: paymentLink.redirect_url,
    expiry: paymentLink.expiry,
    active: paymentLink.active,
    metadata: paymentLink.metadata,
    total_payments: paymentLink.total_payments,
    total_volume: paymentLink.total_volume ? Number(paymentLink.total_volume) / 100 : 0,
    customer: paymentLink.customer
      ? {
          id: paymentLink.customer.id,
          email: paymentLink.customer.email,
          name: paymentLink.customer.name,
        }
      : null,
    created_at: paymentLink.created_at,
    updated_at: paymentLink.updated_at,
  };
}

export async function listPaymentLinksService(params: {
  merchantId: string;
  page: number;
  limit: number;
  active?: boolean;
}) {
  const { merchantId, page, limit, active } = params;

  const where: Prisma.PaymentLinkWhereInput = { merchantId };
  if (typeof active === "boolean") {
    where.active = active;
  }

  const [data, total] = await Promise.all([
    prisma.paymentLink.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: "desc" },
    }),
    prisma.paymentLink.count({ where }),
  ]);

  return {
    data: data.map((link) => ({
      id: link.id,
      slug: link.slug,
      title: link.title,
      description: link.description,
      amount: link.amount ? Number(link.amount) / 100 : null,
      currency: link.currency,
      active: link.active,
      expiry: link.expiry,
      total_payments: link.total_payments,
      total_volume: link.total_volume ? Number(link.total_volume) / 100 : 0,
      created_at: link.created_at,
    })),
    meta: { total, page, limit },
  };
}

export async function updatePaymentLinkService(params: {
  merchantId: string;
  id: string;
  title?: string;
  description?: string;
  redirect_url?: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const { merchantId, id, title, description, redirect_url, active, metadata } = params;

  // Validate metadata max 10 pairs
  if (metadata && Object.keys(metadata).length > 10) {
    throw apiError(400, ErrorCode.INVALID_METADATA, "Metadata cannot exceed 10 key-value pairs");
  }

  await getPaymentLinkByIdService({ merchantId, id });

  const updateData: Prisma.PaymentLinkUpdateInput = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (redirect_url !== undefined) updateData.redirect_url = redirect_url;
  if (active !== undefined) updateData.active = active;
  if (metadata !== undefined) updateData.metadata = metadata as Prisma.InputJsonValue;

  const paymentLink = await prisma.paymentLink.update({
    where: { id },
    data: updateData,
  });

  return {
    id: paymentLink.id,
    slug: paymentLink.slug,
    title: paymentLink.title,
    description: paymentLink.description,
    amount: paymentLink.amount ? Number(paymentLink.amount) / 100 : null,
    currency: paymentLink.currency,
    redirect_url: paymentLink.redirect_url,
    active: paymentLink.active,
    metadata: paymentLink.metadata,
    total_payments: paymentLink.total_payments,
    total_volume: paymentLink.total_volume ? Number(paymentLink.total_volume) / 100 : 0,
    updated_at: paymentLink.updated_at,
  };
}

export async function deletePaymentLinkService(params: { merchantId: string; id: string }) {
  const { merchantId, id } = params;

  await getPaymentLinkByIdService({ merchantId, id });

  // Soft delete by setting active to false
  await prisma.paymentLink.update({
    where: { id },
    data: { active: false },
  });
}

export async function getPaymentLinkBySlugService(slug: string) {
  const paymentLink = await prisma.paymentLink.findUnique({
    where: { slug },
    include: {
      merchant: {
        select: {
          id: true,
          business_name: true,
          checkout_logo_url: true,
          checkout_accent_color: true,
        },
      },
      customer: true,
    },
  });

  if (!paymentLink) {
    throw apiError(404, ErrorCode.PAYMENT_LINK_NOT_FOUND, "Payment link not found");
  }

  // Check if active
  if (!paymentLink.active) {
    throw apiError(410, ErrorCode.PAYMENT_LINK_INACTIVE, "Payment link is inactive");
  }

  // Check if expired
  if (paymentLink.expiry && paymentLink.expiry < new Date()) {
    throw apiError(410, ErrorCode.PAYMENT_LINK_EXPIRED, "Payment link has expired");
  }

  return paymentLink;
}

export async function createChargeFromPaymentLinkService(params: {
  paymentLinkId: string;
  amount?: number;
  customer_email?: string;
}) {
  const { paymentLinkId, amount, customer_email } = params;

  const paymentLink = await prisma.paymentLink.findUnique({
    where: { id: paymentLinkId },
    include: { customer: true },
  });

  if (!paymentLink) {
    throw apiError(404, ErrorCode.PAYMENT_LINK_NOT_FOUND, "Payment link not found");
  }

  if (!paymentLink.active) {
    throw apiError(410, ErrorCode.PAYMENT_LINK_INACTIVE, "Payment link is inactive");
  }

  if (paymentLink.expiry && paymentLink.expiry < new Date()) {
    throw apiError(410, ErrorCode.PAYMENT_LINK_EXPIRED, "Payment link has expired");
  }

  // Use provided amount or link's fixed amount
  const chargeAmount = amount ?? (paymentLink.amount ? Number(paymentLink.amount) / 100 : undefined);
  if (!chargeAmount) {
    throw apiError(400, ErrorCode.MISSING_REQUIRED_FIELD, "Amount is required for open-amount links");
  }

  // Create payment
  const paymentId = crypto.randomUUID();
  const checkoutBase = process.env.PAY_CHECKOUT_BASE || process.env.BASE_URL || "http://localhost:3000";
  const checkout_url = `${checkoutBase.replace(/\/$/, "")}/pay/${paymentId}`;

  const payment = await prisma.payment.create({
    data: {
      id: paymentId,
      merchantId: paymentLink.merchantId,
      amount: Math.floor(chargeAmount * 100),
      currency: paymentLink.currency,
      customer_email: customer_email || paymentLink.customer?.email || "",
      metadata: paymentLink.metadata as Prisma.InputJsonValue,
      description: paymentLink.description || `Payment via link: ${paymentLink.title}`,
      expiration: paymentLink.expiry || new Date(Date.now() + 15 * 60 * 1000),
      status: "pending",
      checkout_url,
      paymentLinkId: paymentLink.id,
      customerId: paymentLink.customerId,
    },
  });

  // Update payment link stats
  await prisma.paymentLink.update({
    where: { id: paymentLinkId },
    data: {
      total_payments: { increment: 1 },
      total_volume: { increment: Math.floor(chargeAmount * 100) },
    },
  });

  return payment;
}
