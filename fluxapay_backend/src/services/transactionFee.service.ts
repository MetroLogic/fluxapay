import { prisma } from "../config/prisma";

export function normalizeNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === "object") {
    const maybe = value as { toString?: () => string; value?: unknown };
    if (typeof maybe.toString === "function") {
      const parsed = Number(maybe.toString());
      if (Number.isFinite(parsed)) return parsed;
    }
    if ("value" in maybe && maybe.value !== undefined) {
      const parsed = normalizeNumericValue(maybe.value);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

export function resolvePlanFeePercent(planLike: unknown): number | null {
  if (!planLike || typeof planLike !== "object") {
    return null;
  }

  const plan = planLike as Record<string, unknown>;

  const directKeys = [
    "transaction_fee_percent",
    "transactionFeePercent",
    "settlement_fee_percent",
    "fee_percent",
    "feePercentage",
    "fee_rate",
    "transaction_fee_rate",
  ];

  for (const key of directKeys) {
    const parsed = normalizeNumericValue(plan[key]);
    if (parsed !== null) return parsed;
  }

  const bpsKeys = [
    "transaction_fee_bps",
    "transactionFeeBps",
    "fee_bps",
    "feeBps",
    "fee_basis_points",
    "transaction_fee_basis_points",
  ];

  for (const key of bpsKeys) {
    const parsed = normalizeNumericValue(plan[key]);
    if (parsed !== null) return parsed / 100;
  }

  for (const nestedKey of ["fee_tier", "tier", "plan_tier"]) {
    const nested = plan[nestedKey];
    if (nested && typeof nested === "object") {
      const nestedPercent = resolvePlanFeePercent(nested);
      if (nestedPercent !== null) return nestedPercent;
    }
    const parsed = normalizeNumericValue(nested);
    if (parsed !== null) return parsed;
  }

  if (Array.isArray(plan.features)) {
    for (const feature of plan.features) {
      if (typeof feature !== "string") continue;

      const directMatch = feature.match(/(?:transaction_)?fee(?:_percent|_rate)?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
      if (directMatch) {
        const value = Number(directMatch[1]);
        if (Number.isFinite(value)) return value;
      }

      const bpsMatch = feature.match(/(?:transaction_)?fee[_\s-]?bps\s*[:=]\s*(\d+(?:\.\d+)?)/i);
      if (bpsMatch) {
        const value = Number(bpsMatch[1]);
        if (Number.isFinite(value)) return value / 100;
      }
    }
  }

  return null;
}

export async function resolveMerchantSettlementFeePercent(
  merchantId: string,
  merchant?: { settlement_fee_percent?: unknown } | null,
): Promise<number> {
  let activeSubscription: { plan?: unknown } | null = null;

  const subscriptionClient = (prisma as any)?.merchantSubscription;
  if (subscriptionClient?.findFirst && merchantId) {
    try {
      activeSubscription = await subscriptionClient.findFirst({
        where: { merchantId, status: "active" },
        include: { plan: true },
        orderBy: { created_at: "desc" },
      });
    } catch {
      activeSubscription = null;
    }
  }

  const planFeePercent = resolvePlanFeePercent(activeSubscription?.plan ?? null);
  if (planFeePercent !== null) return planFeePercent;

  const merchantFeePercent = normalizeNumericValue((merchant as Record<string, unknown> | undefined)?.settlement_fee_percent);
  if (merchantFeePercent !== null) return merchantFeePercent;

  const configured = Number.parseFloat(process.env.SETTLEMENT_FEE_PERCENT ?? "2");
  return Number.isFinite(configured) && configured >= 0 ? configured : 2;
}
