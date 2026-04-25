import { PrismaClient, Prisma } from "../generated/client/client";

const prisma = new PrismaClient();

export async function createCustomerService(params: {
  merchantId: string;
  email: string;
  metadata?: Record<string, unknown>;
}) {
  const { merchantId, email, metadata } = params;
  return prisma.customer.create({
    data: {
      merchantId,
      email,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function listCustomersService(params: {
  merchantId: string;
  page: number;
  limit: number;
  search?: string;
}) {
  const { merchantId, page, limit, search } = params;
  const where: Prisma.CustomerWhereInput = {
    merchantId,
    ...(search
      ? {
          email: { contains: search, mode: "insensitive" as const },
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
    where: { id: params.id, merchantId: params.merchantId },
  });
  if (!row) {
    throw { status: 404, message: "Customer not found" };
  }
  return row;
}

export async function updateCustomerService(params: {
  merchantId: string;
  id: string;
  email?: string;
  metadata?: Record<string, unknown>;
}) {
  await getCustomerByIdService({ merchantId: params.merchantId, id: params.id });

  return prisma.customer.update({
    where: { id: params.id },
    data: {
      ...(params.email !== undefined ? { email: params.email } : {}),
      ...(params.metadata !== undefined
        ? { metadata: params.metadata as Prisma.InputJsonValue }
        : {}),
    },
  });
}

export async function deleteCustomerService(params: {
  merchantId: string;
  id: string;
}) {
  const result = await prisma.customer.deleteMany({
    where: { id: params.id, merchantId: params.merchantId },
  });
  if (result.count === 0) {
    throw { status: 404, message: "Customer not found" };
  }
}
