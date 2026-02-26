/**
 * plan.service.ts
 *
 * Infrastructure for plans, billing cycles, and subscription lifecycle.
 * Supports listing plans, creating subscriptions, and processing recurring
 * billing (renewals) — used by cron for automated billing and by APIs for
 * merchant-triggered subscription management.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { PrismaClient } from "../generated/client/client";
import { createAndDeliverWebhook } from "./webhook.service";

const prisma = new PrismaClient();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanPublic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: "monthly" | "yearly";
}

export interface SubscriptionDue {
  id: string;
  merchantId: string;
  planId: string;
  planSlug: string;
  nextBillingDate: Date;
  billingCycle: "monthly" | "yearly";
}

export interface ProcessBillingCycleResult {
  processed: number;
  renewed: number;
  errors: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addInterval(date: Date, interval: "monthly" | "yearly"): Date {
  const next = new Date(date);
  if (interval === "monthly") {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setFullYear(next.getFullYear() + 1);
  }
  return next;
}

// ─── Plans ────────────────────────────────────────────────────────────────────

/**
 * List all active plans (for display or API).
 */
export async function getPlans(): Promise<PlanPublic[]> {
  const plans = await prisma.plan.findMany({
    orderBy: { amount: "asc" },
  });
  return plans.map((p: typeof plans[number]) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    amount: Number(p.amount as Decimal),
    currency: p.currency,
    interval: p.interval as "monthly" | "yearly",
  }));
}

/**
 * Get a single plan by id or slug.
 */
export async function getPlanById(id: string): Promise<PlanPublic | null> {
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return null;
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    amount: Number(plan.amount as Decimal),
    currency: plan.currency,
    interval: plan.interval as "monthly" | "yearly",
  };
}

export async function getPlanBySlug(slug: string): Promise<PlanPublic | null> {
  const plan = await prisma.plan.findUnique({ where: { slug } });
  if (!plan) return null;
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    amount: Number(plan.amount as Decimal),
    currency: plan.currency,
    interval: plan.interval as "monthly" | "yearly",
  };
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Create a subscription for a merchant on a plan.
 * Sends subscription_created webhook if merchant has webhook_url.
 */
export async function createSubscription(params: {
  merchantId: string;
  planId: string;
}): Promise<{ subscriptionId: string; nextBillingDate: Date }> {
  const plan = await prisma.plan.findUnique({ where: { id: params.planId } });
  if (!plan) throw new Error("Plan not found");

  const now = new Date();
  const periodEnd = addInterval(now, plan.interval as "monthly" | "yearly");
  const nextBilling = new Date(periodEnd);

  const sub = await prisma.merchantSubscription.create({
    data: {
      merchantId: params.merchantId,
      planId: plan.id,
      billing_cycle: plan.interval,
      current_period_start: now,
      current_period_end: periodEnd,
      next_billing_date: nextBilling,
    },
    include: { merchant: true, plan: true },
  });

  if (sub.merchant.webhook_url) {
    createAndDeliverWebhook(
      params.merchantId,
      "subscription_created",
      {
        event: "subscription.created",
        subscription_id: sub.id,
        plan_id: plan.id,
        plan_slug: plan.slug,
        billing_cycle: plan.interval,
        current_period_end: periodEnd.toISOString(),
        next_billing_date: nextBilling.toISOString(),
      },
    ).catch((err) =>
      console.error("[Plan] subscription_created webhook failed:", err),
    );
  }

  return { subscriptionId: sub.id, nextBillingDate: nextBilling };
}

/**
 * Find active subscriptions whose next_billing_date is due (<= now).
 * Used by the billing cycle cron job.
 */
export async function getSubscriptionsDueForRenewal(): Promise<SubscriptionDue[]> {
  const list = await prisma.merchantSubscription.findMany({
    where: {
      status: "active",
      next_billing_date: { lte: new Date() },
    },
    include: { plan: true },
  });
  return list.map((s: typeof list[number]) => ({
    id: s.id,
    merchantId: s.merchantId,
    planId: s.planId,
    planSlug: s.plan.slug,
    nextBillingDate: s.next_billing_date,
    billingCycle: s.billing_cycle as "monthly" | "yearly",
  }));
}

/**
 * Process one billing cycle: advance period for due subscriptions,
 * send subscription_renewed webhooks, and optionally create merchant-triggered
 * charges (Payment records) for the plan amount.
 * Call this from the billing cron job.
 */
export async function processBillingCycle(): Promise<ProcessBillingCycleResult> {
  const due = await getSubscriptionsDueForRenewal();
  const errors: string[] = [];
  let renewed = 0;

  for (const sub of due) {
    try {
      const subscription = await prisma.merchantSubscription.findUnique({
        where: { id: sub.id },
        include: { merchant: true, plan: true },
      });
      if (!subscription || subscription.status !== "active") continue;

      const now = new Date();
      const periodStart = new Date(subscription.next_billing_date);
      const periodEnd = addInterval(
        periodStart,
        subscription.billing_cycle as "monthly" | "yearly",
      );
      const nextBilling = new Date(periodEnd);

      await prisma.merchantSubscription.update({
        where: { id: sub.id },
        data: {
          current_period_start: periodStart,
          current_period_end: periodEnd,
          next_billing_date: nextBilling,
        },
      });

      if (subscription.merchant.webhook_url) {
        await createAndDeliverWebhook(
          subscription.merchantId,
          "subscription_renewed",
          {
            event: "subscription.renewed",
            subscription_id: subscription.id,
            plan_id: subscription.planId,
            plan_slug: subscription.plan.slug,
            renewed_at: now.toISOString(),
            next_billing_date: nextBilling.toISOString(),
            billing_cycle: subscription.billing_cycle,
          },
        );
      }
      renewed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Subscription ${sub.id}: ${msg}`);
    }
  }

  return {
    processed: due.length,
    renewed,
    errors,
  };
}
