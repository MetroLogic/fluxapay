import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { PrismaClient, Prisma } from "../generated/client/client";

const prisma = new PrismaClient();

function validateAndNormalizeEmail(email: string): string {
  // RFC 5322 basic validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw apiError(400, ErrorCode.INVALID_EMAIL, "Invalid email format");
  }
  return email.toLowerCase().trim();
}

export async function createCustomerService(params: {
  merchantId: string;
  email: string;
  name?: string;
  phone?: string;
  stellar_address?: string;
  metadata?: Record<string, unknown>;
}) {
  const { merchantId, email, name, phone, stellar_address, metadata } = params;

  // Validate and normalize email
  const normalizedEmail = validateAndNormalizeEmail(email);

  // Validate metadata max 10 pairs
  if (metadata && Object.keys(metadata).length > 10) {
    throw apiError(400, ErrorCode.INVALID_METADATA, "Metadata cannot exceed 10 key-value pairs");
  }

  // Check for duplicate email per merchant
  const existing = await prisma.customer.findFirst({
    where: {
      merchantId,
      email: normalizedEmail,
      deleted_at: null,
    },
  });

  if (existing) {
    throw apiError(409, ErrorCode.CUSTOMER_ALREADY_EXISTS, "Customer with this email already exists");
  }

  return prisma.customer.create({
    data: {
      merchantId,
      email: normalizedEmail,
      name,
      phone,
      stellar_address,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function listCustomersService(params: {
  merchantId: string;
  page: number;
  limit: number;
  search?: string;
  created_after?: Date;
  created_before?: Date;
}) {
  const { merchantId, page, limit, search, created_after, created_before } = params;
  const where: Prisma.CustomerWhereInput = {
    merchantId,
    deleted_at: null,
    ...(search
      ? {
          email: { contains: search, mode: "insensitive" as const },
        }
      : {}),
    ...(created_after || created_before
      ? {
          created_at: {
            ...(created_after ? { gte: created_after } : {}),
            ...(created_before ? { lte: created_before } : {}),
          },
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: "desc" },
    }),
    prisma.customer.count({ where }),
  ]);

  return { data, meta: { total, page, limit } };
}

export async function getCustomerByIdService(params: {
  merchantId: string;
  id: string;
}) {
  const row = await prisma.customer.findFirst({
    where: { id: params.id, merchantId: params.merchantId, deleted_at: null },
  });

  if (!row) {
    throw apiError(404, ErrorCode.CUSTOMER_NOT_FOUND, "Customer not found");
  }

  // Get payment history summary
  const paymentStats = await prisma.payment.aggregate({
    where: {
      customerId: row.id,
      merchantId: params.merchantId,
    },
    _count: { id: true },
    _sum: { amount: true },
  });

  return {
    ...row,
    payment_count: paymentStats._count.id,
    total_volume: paymentStats._sum.amount ? Number(paymentStats._sum.amount) / 100 : 0,
  };
}

export async function updateCustomerService(params: {
  merchantId: string;
  id: string;
  email?: string;
  name?: string;
  phone?: string;
  stellar_address?: string;
  metadata?: Record<string, unknown>;
}) {
  const { merchantId, id, email, name, phone, stellar_address, metadata } = params;

  await getCustomerByIdService({ merchantId, id });

  // Validate and normalize email if provided
  let normalizedEmail: string | undefined;
  if (email !== undefined) {
    normalizedEmail = validateAndNormalizeEmail(email);

    // Check for duplicate email per merchant (excluding current customer)
    const existing = await prisma.customer.findFirst({
      where: {
        merchantId,
        email: normalizedEmail,
        id: { not: id },
        deleted_at: null,
      },
    });

    if (existing) {
      throw apiError(409, ErrorCode.CUSTOMER_ALREADY_EXISTS, "Customer with this email already exists");
    }
  }

  // Validate metadata max 10 pairs
  if (metadata && Object.keys(metadata).length > 10) {
    throw apiError(400, ErrorCode.INVALID_METADATA, "Metadata cannot exceed 10 key-value pairs");
  }

  const updateData: Prisma.CustomerUpdateInput = {};
  if (normalizedEmail !== undefined) updateData.email = normalizedEmail;
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (stellar_address !== undefined) updateData.stellar_address = stellar_address;
  if (metadata !== undefined) updateData.metadata = metadata as Prisma.InputJsonValue;

  return prisma.customer.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteCustomerService(params: {
  merchantId: string;
  id: string;
}) {
  const customer = await prisma.customer.findFirst({
    where: { id: params.id, merchantId: params.merchantId, deleted_at: null },
  });

  if (!customer) {
    throw apiError(404, ErrorCode.CUSTOMER_NOT_FOUND, "Customer not found");
  }

  // Soft-delete with GDPR anonymization
  await prisma.customer.update({
    where: { id: params.id },
    data: {
      deleted_at: new Date(),
      email: `deleted-${customer.id}@anonymous.local`,
      name: null,
      phone: null,
      stellar_address: null,
      metadata: {},
    },
  });
}
