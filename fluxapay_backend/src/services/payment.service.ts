import prisma from "../lib/prisma";

interface ListPaymentsFilters {
  page?: number;
  limit?: number;
  status?: string;
  currency?: string;
  date_from?: string;
  date_to?: string;
  amount_min?: number;
  amount_max?: number;
  search?: string;
  sort_by?: "date" | "amount" | "status";
  order?: "asc" | "desc";
}

export async function listPaymentsService(
  merchantId: string,
  filters: ListPaymentsFilters,
) {
  const {
    page = 1,
    limit = 10,
    status,
    currency,
    date_from,
    date_to,
    amount_min,
    amount_max,
    search,
    sort_by = "date",
    order = "desc",
  } = filters;

  const skip = (page - 1) * limit;

  // Build where clause for filtering
  const whereClause: any = {
    merchantId,
  };

  if (status) {
    whereClause.status = status;
  }

  if (currency) {
    whereClause.currency = currency;
  }

  if (date_from || date_to) {
    whereClause.created_at = {};
    if (date_from) {
      whereClause.created_at.gte = new Date(date_from);
    }
    if (date_to) {
      whereClause.created_at.lte = new Date(date_to);
    }
  }

  if (amount_min !== undefined || amount_max !== undefined) {
    whereClause.amount = {};
    if (amount_min !== undefined) {
      whereClause.amount.gte = amount_min;
    }
    if (amount_max !== undefined) {
      whereClause.amount.lte = amount_max;
    }
  }

  // Handle search across multiple fields
  if (search) {
    whereClause.OR = [
      { payment_id: { contains: search, mode: "insensitive" } },
      { order_id: { contains: search, mode: "insensitive" } },
      { customer: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  // Determine sort field
  let orderByClause: any = {};
  switch (sort_by) {
    case "amount":
      orderByClause.amount = order;
      break;
    case "status":
      orderByClause.status = order;
      break;
    case "date":
    default:
      orderByClause.created_at = order;
  }

  // Execute query
  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where: whereClause,
      include: {
        customer: true,
        transactions: true,
      },
      orderBy: orderByClause,
      skip,
      take: limit,
    }),
    prisma.payment.count({ where: whereClause }),
  ]);

  return {
    data: payments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function getPaymentDetailsService(
  merchantId: string,
  paymentId: string,
) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      merchantId,
    },
    include: {
      customer: true,
      transactions: true,
      timeline_events: {
        orderBy: {
          created_at: "asc",
        },
      },
    },
  });

  if (!payment) {
    throw { status: 404, message: "Payment not found" };
  }

  return payment;
}

export async function exportPaymentsService(
  merchantId: string,
  filters: ListPaymentsFilters,
  format: "csv" = "csv",
) {
  const {
    status,
    currency,
    date_from,
    date_to,
    amount_min,
    amount_max,
    search,
  } = filters;

  // Build where clause (similar to listPaymentsService)
  const whereClause: any = {
    merchantId,
  };

  if (status) {
    whereClause.status = status;
  }

  if (currency) {
    whereClause.currency = currency;
  }

  if (date_from || date_to) {
    whereClause.created_at = {};
    if (date_from) {
      whereClause.created_at.gte = new Date(date_from);
    }
    if (date_to) {
      whereClause.created_at.lte = new Date(date_to);
    }
  }

  if (amount_min !== undefined || amount_max !== undefined) {
    whereClause.amount = {};
    if (amount_min !== undefined) {
      whereClause.amount.gte = amount_min;
    }
    if (amount_max !== undefined) {
      whereClause.amount.lte = amount_max;
    }
  }

  if (search) {
    whereClause.OR = [
      { payment_id: { contains: search, mode: "insensitive" } },
      { order_id: { contains: search, mode: "insensitive" } },
      { customer: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  // Fetch all payments matching criteria
  const payments = await prisma.payment.findMany({
    where: whereClause,
    include: {
      customer: true,
      transactions: true,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  if (format === "csv") {
    return generateCSV(payments);
  }

  throw { status: 400, message: "Unsupported export format" };
}

function generateCSV(payments: any[]): string {
  const headers = [
    "Payment ID",
    "Order ID",
    "Customer Email",
    "Customer Name",
    "Amount",
    "Currency",
    "Status",
    "Created At",
    "Transaction Hash",
  ];

  const rows = payments.map((payment) => [
    payment.payment_id,
    payment.order_id,
    payment.customer.email,
    payment.customer.name,
    payment.amount,
    payment.currency,
    payment.status,
    new Date(payment.created_at).toISOString(),
    payment.transaction_hash || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => {
          // Escape quotes and wrap in quotes if contains comma
          const stringCell = String(cell || "");
          if (stringCell.includes(",") || stringCell.includes('"')) {
            return `"${stringCell.replace(/"/g, '""')}"`;
          }
          return stringCell;
        })
        .join(","),
    ),
  ].join("\n");

  return csvContent;
}
