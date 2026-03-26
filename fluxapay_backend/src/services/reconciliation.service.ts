import {
  AlertSeverity,
  PrismaClient,
  ReconciliationStatus,
} from "../generated/client/client";

const prisma = new PrismaClient();

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  return Number(value ?? 0);
}

function buildSeverity(
  discrepancyAmount: number,
  discrepancyPercent: number,
  amountThreshold: number,
  percentThreshold: number
): AlertSeverity {
  const amountRatio = amountThreshold > 0 ? discrepancyAmount / amountThreshold : 0;
  const percentRatio = percentThreshold > 0 ? discrepancyPercent / percentThreshold : 0;
  const worstRatio = Math.max(amountRatio, percentRatio);

  if (worstRatio >= 2) {
    return "high";
  }
  if (worstRatio >= 1) {
    return "medium";
  }
  return "low";
}

async function getThresholdForMerchant(merchantId: string) {
  const threshold = await prisma.discrepancyThreshold.findFirst({
    where: {
      is_active: true,
      OR: [{ merchantId }, { merchantId: null }],
    },
    orderBy: [{ merchantId: "desc" }, { updated_at: "desc" }],
  });

  return {
    threshold,
    amountThreshold: toNumber(threshold?.amount_threshold ?? 0),
    percentThreshold: toNumber(threshold?.percent_threshold ?? 0),
  };
}

async function reconcileMerchant(
  merchantId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const [paymentAggregate, settlementAggregate, thresholdConfig] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        merchantId,
        status: "completed",
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      _sum: { amount: true },
    }),
    prisma.settlement.aggregate({
      where: {
        merchantId,
        status: "completed",
        processed_date: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      _sum: { amount: true },
    }),
    getThresholdForMerchant(merchantId),
  ]);

  const expectedTotal = toNumber(paymentAggregate._sum.amount);
  const actualTotal = toNumber(settlementAggregate._sum.amount);
  const discrepancyAmount = Math.abs(expectedTotal - actualTotal);
  const discrepancyPercent =
    expectedTotal === 0 ? (actualTotal === 0 ? 0 : 100) : (discrepancyAmount / expectedTotal) * 100;

  const status: ReconciliationStatus =
    discrepancyAmount > thresholdConfig.amountThreshold ||
    discrepancyPercent > thresholdConfig.percentThreshold
      ? "discrepancy_detected"
      : "ok";

  const record = await prisma.reconciliationRecord.upsert({
    where: {
      merchantId_period_start_period_end: {
        merchantId,
        period_start: periodStart,
        period_end: periodEnd,
      },
    },
    create: {
      merchantId,
      period_start: periodStart,
      period_end: periodEnd,
      expected_total: expectedTotal,
      actual_total: actualTotal,
      discrepancy_amount: discrepancyAmount,
      discrepancy_percent: discrepancyPercent,
      status,
    },
    update: {
      expected_total: expectedTotal,
      actual_total: actualTotal,
      discrepancy_amount: discrepancyAmount,
      discrepancy_percent: discrepancyPercent,
      status,
    },
  });

  if (status === "discrepancy_detected") {
    const unresolvedAlert = await prisma.discrepancyAlert.findFirst({
      where: {
        reconciliationRecordId: record.id,
        is_resolved: false,
      },
    });

    if (!unresolvedAlert) {
      const severity = buildSeverity(
        discrepancyAmount,
        discrepancyPercent,
        thresholdConfig.amountThreshold,
        thresholdConfig.percentThreshold
      );

      await prisma.discrepancyAlert.create({
        data: {
          merchantId,
          reconciliationRecordId: record.id,
          thresholdId: thresholdConfig.threshold?.id,
          severity,
          message: `Discrepancy detected for ${periodStart.toISOString()} - ${periodEnd.toISOString()}. Expected ${expectedTotal}, actual ${actualTotal}.`,
        },
      });
    }
  }

  return record;
}

export async function getReconciliationSummaryService(params: {
  merchant_id?: string;
  period_start: string;
  period_end: string;
}) {
  const periodStart = new Date(params.period_start);
  const periodEnd = new Date(params.period_end);

  if (periodStart > periodEnd) {
    throw { status: 400, message: "period_start must be earlier than period_end" };
  }

  const merchants = params.merchant_id
    ? await prisma.merchant.findMany({ where: { id: params.merchant_id }, select: { id: true } })
    : await prisma.merchant.findMany({ select: { id: true } });

  const records = await Promise.all(
    merchants.map((merchant) => reconcileMerchant(merchant.id, periodStart, periodEnd))
  );

  const totals = records.reduce(
    (acc, record) => {
      acc.expected_total += toNumber(record.expected_total);
      acc.actual_total += toNumber(record.actual_total);
      acc.discrepancy_amount += toNumber(record.discrepancy_amount);
      if (record.status === "discrepancy_detected") {
        acc.discrepancy_count += 1;
      }
      return acc;
    },
    {
      expected_total: 0,
      actual_total: 0,
      discrepancy_amount: 0,
      discrepancy_count: 0,
    }
  );

  return {
    message: "Reconciliation summary generated",
    data: {
      period_start: periodStart,
      period_end: periodEnd,
      merchant_count: records.length,
      ...totals,
      records,
    },
  };
}

export async function listDiscrepancyAlertsService(params: {
  merchant_id?: string;
  is_resolved?: boolean;
  page: number;
  limit: number;
}) {
  const { merchant_id, is_resolved, page, limit } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (merchant_id) {
    where.merchantId = merchant_id;
  }
  if (typeof is_resolved === "boolean") {
    where.is_resolved = is_resolved;
  }

  const [alerts, total] = await Promise.all([
    prisma.discrepancyAlert.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      include: {
        reconciliationRecord: true,
        threshold: true,
      },
    }),
    prisma.discrepancyAlert.count({ where }),
  ]);

  return {
    message: "Discrepancy alerts retrieved",
    data: {
      alerts,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    },
  };
}

export async function upsertDiscrepancyThresholdService(params: {
  merchant_id?: string;
  amount_threshold: number;
  percent_threshold: number;
  is_active: boolean;
}) {
  const { merchant_id, amount_threshold, percent_threshold, is_active } = params;

  const existing = await prisma.discrepancyThreshold.findFirst({
    where: { merchantId: merchant_id ?? null },
    orderBy: { created_at: "desc" },
  });

  const threshold = existing
    ? await prisma.discrepancyThreshold.update({
        where: { id: existing.id },
        data: {
          amount_threshold,
          percent_threshold,
          is_active,
        },
      })
    : await prisma.discrepancyThreshold.create({
        data: {
          merchantId: merchant_id ?? null,
          amount_threshold,
          percent_threshold,
          is_active,
        },
      });

  return {
    message: "Discrepancy threshold saved",
    data: threshold,
  };
}

export async function resolveDiscrepancyAlertService(params: {
  alert_id: string;
  is_resolved: boolean;
}) {
  const { alert_id, is_resolved } = params;

  const alert = await prisma.discrepancyAlert.update({
    where: { id: alert_id },
    data: {
      is_resolved,
      resolved_at: is_resolved ? new Date() : null,
    },
  });

  return {
    message: "Discrepancy alert updated",
    data: alert,
  };
}
