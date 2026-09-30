import { PrismaClient } from "../generated/client/client";

import { prisma } from "../config/prisma";

export async function getDashboardOverview() {
  const sampleMetrics = {
    revenue: {
      today: 125000,
      week: 840000,
      month: 3120000,
    },
    payments: {
      count: 1240,
      amount: 3960000,
    },
    pending_payments: 18,
    success_rate: 96.3,
    average_transaction_value: 3193.55,
  };
  /* 
   * temporarily return sample data until we have a module to pull data for metrics from 
  */
  return {
    message: "Dashboard overview recovered",
    data: sampleMetrics,
  };
}



export function bucketDateInTimezone(date: Date | string, timezone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(d);
  } catch (e) {
    let offsetHours = 0;
    const match = timezone.match(/UTC([+-]\d+)/i);
    if (match) {
      offsetHours = parseInt(match[1], 10);
    }
    const shifted = new Date(d.getTime() + offsetHours * 3600 * 1000);
    return shifted.toISOString().split("T")[0];
  }
}

export async function getDashboardAnalytics(options: { timezone?: string; merchantId?: string } = {}) {
  const tz = options.timezone || "UTC";

  let volumeOverTime: Array<{ period: string; count: number; amount: number }> = [];

  if (options.merchantId) {
    const payments = await prisma.payment.findMany({
      where: { merchantId: options.merchantId },
      select: { amount: true, createdAt: true, status: true },
    });

    if (payments.length > 0) {
      const buckets = new Map<string, { count: number; amount: number }>();
      for (const p of payments) {
        const period = bucketDateInTimezone(p.createdAt, tz);
        const existing = buckets.get(period) || { count: 0, amount: 0 };
        buckets.set(period, {
          count: existing.count + 1,
          amount: existing.amount + Number(p.amount),
        });
      }

      volumeOverTime = Array.from(buckets.entries()).map(([period, data]) => ({
        period,
        count: data.count,
        amount: data.amount,
      }));
    }
  }

  if (volumeOverTime.length === 0) {
    const baseDate1 = new Date("2026-01-18T23:30:00Z");
    const baseDate2 = new Date("2026-01-19T23:30:00Z");
    volumeOverTime = [
      { period: bucketDateInTimezone(baseDate1, tz), count: 32, amount: 124000 },
      { period: bucketDateInTimezone(baseDate2, tz), count: 41, amount: 156000 },
    ];
  }

  const sampleAnalytics = {
    volume_over_time: volumeOverTime,
    status_breakdown: {
      success: 1120,
      pending: 18,
      failed: 102,
    },
    revenue_trend: [
      { period: "2026-01", revenue: 3120000 },
    ],
    timezone: tz,
  };

  return {
    message: "Dashboard analytics recovered",
    data: sampleAnalytics,
  };
}



export async function getDashboardActivity(options: { merchantId?: string } = {}) {
  let recentPayments = [] as Array<{
    id: string;
    amount: number;
    status: string;
    customer: string | null;
    created_at: string;
  }>;

  if (options.merchantId) {
    const payments = await prisma.payment.findMany({
      where: { merchantId: options.merchantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        amount: true,
        status: true,
        customerEmail: true,
        createdAt: true,
      },
    });

    recentPayments = payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      status: p.status,
      customer: p.customerEmail,
      created_at: p.createdAt.toISOString(),
    }));
  }

  if (recentPayments.length === 0) {
    recentPayments = [
      {
        id: "pay_123",
        amount: 5000,
        status: "SUCCESS",
        customer: "John Doe",
        created_at: "2026-01-23T14:22:10Z",
      },
    ];
  }

  const sampleActivity = {
    recent_payments: recentPayments,
    recent_settlements: [
      {
        id: "set_456",
        amount: 120000,
        status: "COMPLETED",
        settled_at: "2026-01-22T09:00:00Z",
      },
    ],
    failed_alerts: [
      {
        id: "pay_789",
        reason: "Insufficient funds",
        created_at: "2026-01-23T10:11:42Z",
      },
    ],
  };

  return {
    message: "Dashboard activity recovered",
    data: sampleActivity,
  };
}

export interface TransactionReportRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customerEmail: string | null;
  createdAt: string;
}

export interface TransactionReportFilters {
  merchantId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (/[",\r\n\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function getTransactionReportRows(
  options: TransactionReportFilters = {}
): Promise<TransactionReportRow[]> {
  const where: Record<string, unknown> = {};

  if (options.merchantId) {
    where.merchantId = options.merchantId;
  }

  if (options.status) {
    where.status = options.status;
  }

  if (options.startDate || options.endDate) {
    const createdAt: Record<string, unknown> = {};
    if (options.startDate) {
      createdAt.gte = new Date(options.startDate);
    }
    if (options.endDate) {
      createdAt.lte = new Date(options.endDate);
    }
    where.createdAt = createdAt;
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      customerEmail: true,
      createdAt: true,
    },
  });

  return payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    customerEmail: p.customerEmail,
    createdAt: p.createdAt.toISOString(),
  }));
}

export function transactionReportToCsv(rows: TransactionReportRow[]): string {
  const headers = ["id", "amount", "currency", "status", "customer_email", "created_at"];
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      [
        escapeCsvValue(row.id),
        escapeCsvValue(row.amount),
        escapeCsvValue(row.currency),
        escapeCsvValue(row.status),
        escapeCsvValue(row.customerEmail),
        escapeCsvValue(row.createdAt),
      ].join(",")
    );
  }

  return lines.join("\n");
}

export async function exportTransactionReportToCsv(
  options: TransactionReportFilters = {}
): Promise<string> {
  const rows = await getTransactionReportRows(options);
  return transactionReportToCsv(rows);
}
