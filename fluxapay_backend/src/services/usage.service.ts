/**
 * usage.service.ts — plan usage metering, limit enforcement, and notifications.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { PrismaClient } from "../generated/client/client";
import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { createAndDeliverWebhook } from "./webhook.service";

const prisma = new PrismaClient();

export type UsageMetric = "api_calls" | "charges_created" | "settlement_volume";

export interface PlanLimits {
  api_call_limit: number | null;
  charge_limit: number | null;
  settlement_volume_limit: number | null;
  overage_mode: "hard_block" | "soft_overage";
  features: string[];
}

export interface UsageMetricSnapshot {
  used: number;
  limit: number | null;
  percent: number | null;
}

export interface MerchantUsageResponse {
  period_start: string;
  period_end: string;
  plan: { slug: string; name: string } | null;
  metrics: {
    api_calls: UsageMetricSnapshot;
    charges_created: UsageMetricSnapshot;
    settlement_volume: UsageMetricSnapshot;
  };
  overage_mode: "hard_block" | "soft_overage";
}

const DEFAULT_LIMITS: PlanLimits = {
  api_call_limit: 10_000,
  charge_limit: 1_000,
  settlement_volume_limit: 100_000,
  overage_mode: "hard_block",
  features: [],
};

function percentUsed(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.round((used / limit) * 100);
}

function parseFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((f): f is string => typeof f === "string");
  return [];
}

async function resolveActivePlan(merchantId: string): Promise<{
  plan: { slug: string; name: string; limits: PlanLimits } | null;
  periodStart: Date;
  periodEnd: Date;
}> {
  const sub = await prisma.merchantSubscription.findFirst({
    where: { merchantId, status: "active" },
    include: { plan: true },
    orderBy: { created_at: "desc" },
  });

  if (sub) {
    return {
      plan: {
        slug: sub.plan.slug,
        name: sub.plan.name,
        limits: {
          api_call_limit: sub.plan.api_call_limit,
          charge_limit: sub.plan.charge_limit,
          settlement_volume_limit: sub.plan.settlement_volume_limit
            ? Number(sub.plan.settlement_volume_limit as Decimal)
            : null,
          overage_mode: (sub.plan.overage_mode as "hard_block" | "soft_overage") ?? "hard_block",
          features: parseFeatures(sub.plan.features),
        },
      },
      periodStart: sub.current_period_start,
      periodEnd: sub.current_period_end,
    };
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { plan: null, periodStart, periodEnd };
}

async function getOrCreateUsagePeriod(
  merchantId: string,
  periodStart: Date,
  periodEnd: Date,
) {
  const existing = await prisma.merchantUsagePeriod.findUnique({
    where: { merchantId_period_start: { merchantId, period_start: periodStart } },
  });
  if (existing) return existing;

  return prisma.merchantUsagePeriod.create({
    data: { merchantId, period_start: periodStart, period_end: periodEnd },
  });
}

export async function getMerchantUsage(merchantId: string): Promise<MerchantUsageResponse> {
  const { plan, periodStart, periodEnd } = await resolveActivePlan(merchantId);
  const limits = plan?.limits ?? DEFAULT_LIMITS;
  const usage = await getOrCreateUsagePeriod(merchantId, periodStart, periodEnd);

  const apiUsed = usage.api_calls;
  const chargesUsed = usage.charges_created;
  const volumeUsed = Number(usage.settlement_volume as Decimal);

  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    plan: plan ? { slug: plan.slug, name: plan.name } : null,
    overage_mode: limits.overage_mode,
    metrics: {
      api_calls: {
        used: apiUsed,
        limit: limits.api_call_limit,
        percent: percentUsed(apiUsed, limits.api_call_limit),
      },
      charges_created: {
        used: chargesUsed,
        limit: limits.charge_limit,
        percent: percentUsed(chargesUsed, limits.charge_limit),
      },
      settlement_volume: {
        used: volumeUsed,
        limit: limits.settlement_volume_limit,
        percent: percentUsed(volumeUsed, limits.settlement_volume_limit),
      },
    },
  };
}

async function notifyUsageThreshold(
  merchantId: string,
  usage: MerchantUsageResponse,
  periodStart: Date,
) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) return;

  const eventId = `${merchantId}:usage-80:${periodStart.toISOString()}`;
  const payload = {
    event: "usage.threshold_reached",
    merchant_id: merchantId,
    threshold_percent: 80,
    usage: usage.metrics,
    period_start: usage.period_start,
    period_end: usage.period_end,
  };

  if (merchant.webhook_url) {
    createAndDeliverWebhook(
      merchantId,
      "subscription_renewed",
      payload,
      undefined,
      undefined,
      eventId,
    ).catch((err) => console.error("[Usage] threshold webhook failed:", err));
  }

  if (merchant.email_notifications_enabled) {
    console.log(
      `[Usage] 80% threshold email for merchant ${merchantId} → ${merchant.email}`,
    );
  }
}

export async function incrementUsage(
  merchantId: string,
  metric: UsageMetric,
  amount = 1,
): Promise<void> {
  const { plan, periodStart, periodEnd } = await resolveActivePlan(merchantId);
  const usage = await getOrCreateUsagePeriod(merchantId, periodStart, periodEnd);

  const data: Record<string, unknown> = {};
  if (metric === "api_calls") data.api_calls = { increment: amount };
  if (metric === "charges_created") data.charges_created = { increment: amount };
  if (metric === "settlement_volume") {
    data.settlement_volume = { increment: new Decimal(amount) };
  }

  const updated = await prisma.merchantUsagePeriod.update({
    where: { id: usage.id },
    data,
  });

  const limits = plan?.limits ?? DEFAULT_LIMITS;
  const snapshots: Record<UsageMetric, { used: number; limit: number | null }> = {
    api_calls: { used: updated.api_calls, limit: limits.api_call_limit },
    charges_created: { used: updated.charges_created, limit: limits.charge_limit },
    settlement_volume: {
      used: Number(updated.settlement_volume as Decimal),
      limit: limits.settlement_volume_limit,
    },
  };

  const anyOver80 = Object.values(snapshots).some(
    ({ used, limit }) => limit !== null && limit > 0 && used / limit >= 0.8,
  );

  if (anyOver80 && !updated.warning_80_sent_at) {
    await prisma.merchantUsagePeriod.update({
      where: { id: updated.id },
      data: { warning_80_sent_at: new Date() },
    });
    const usageResponse = await getMerchantUsage(merchantId);
    await notifyUsageThreshold(merchantId, usageResponse, periodStart);
  }
}

export async function checkUsageLimit(
  merchantId: string,
  metric: UsageMetric,
): Promise<{ allowed: boolean; usage: MerchantUsageResponse; retryAfterSeconds?: number }> {
  const usage = await getMerchantUsage(merchantId);
  const { plan, periodStart, periodEnd } = await resolveActivePlan(merchantId);
  const limits = plan?.limits ?? DEFAULT_LIMITS;
  const overageMode = limits.overage_mode;

  const metricSnapshot = usage.metrics[metric];
  if (metricSnapshot.limit === null) {
    return { allowed: true, usage };
  }

  if (metricSnapshot.used >= metricSnapshot.limit) {
    if (overageMode === "soft_overage") {
      return { allowed: true, usage };
    }
    const retryAfterSeconds = Math.max(
      0,
      Math.floor((periodEnd.getTime() - Date.now()) / 1000),
    );
    return { allowed: false, usage, retryAfterSeconds };
  }

  return { allowed: true, usage };
}

export function enforceUsageLimitError(
  usage: MerchantUsageResponse,
  retryAfterSeconds?: number,
) {
  throw apiError(
    429,
    ErrorCode.PLAN_LIMIT_EXCEEDED,
    "Plan usage limit exceeded for the current billing period.",
    { retryAfterSeconds, details: { usage: usage.metrics } },
  );
}

/** Admin: query usage records with optional filters. */
export async function queryAdminUsage(params: {
  merchantId?: string;
  overLimit?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 50, 100);
  const skip = (page - 1) * limit;

  const periods = await prisma.merchantUsagePeriod.findMany({
    where: params.merchantId ? { merchantId: params.merchantId } : undefined,
    orderBy: { period_start: "desc" },
    skip,
    take: limit,
  });

  const results = [];
  for (const period of periods) {
    const usage = await getMerchantUsage(period.merchantId);
    const overAny = Object.values(usage.metrics).some(
      (m) => m.limit !== null && m.percent !== null && m.percent >= 100,
    );
    if (params.overLimit && !overAny) continue;
    results.push({ merchantId: period.merchantId, usage });
  }

  return { data: results, page, limit };
}

export function merchantHasFeature(features: string[], feature: string): boolean {
  return features.includes(feature);
}

export async function getMerchantPlanFeatures(merchantId: string): Promise<string[]> {
  const { plan } = await resolveActivePlan(merchantId);
  return plan?.limits.features ?? DEFAULT_LIMITS.features;
}
