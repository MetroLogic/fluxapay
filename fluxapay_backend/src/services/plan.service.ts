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
import { sendSubscriptionPriceChangeNoticeEmail } from "./email.service";

const prisma = new PrismaClient();

const PRICE_CHANGE_NOTICE_LOCK = "subscription_price_change_notice";
const PRICE_CHANGE_NOTICE_LOCK_TTL_MS = 5 * 60 * 1000;
const PRICE_CHANGE_NOTICE_WINDOW_DAYS = 7;

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
      current_period_amount: plan.amount,
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

      // Always charge the plan's *current* amount, not whatever was stored
      // from a previous period -- an admin price change must take effect
      // on the very next renewal rather than being silently ignored.
      await prisma.merchantSubscription.update({
        where: { id: sub.id },
        data: {
          current_period_start: periodStart,
          current_period_end: periodEnd,
          next_billing_date: nextBilling,
          current_period_amount: subscription.plan.amount,
          // Reset so a further price change ahead of the *next* renewal
          // gets its own notice.
          price_change_notice_sent_at: null,
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

// ─── Upcoming price-change notices ─────────────────────────────────────────────

export interface PriceChangeNoticeResult {
  processed: number;
  notified: number;
  errors: { subscriptionId: string; error: string }[];
}

async function acquirePriceChangeNoticeLock(lockedBy: string): Promise<boolean> {
  const now = new Date();
  try {
    await prisma.cronLock.upsert({
      where: { job_name: PRICE_CHANGE_NOTICE_LOCK },
      create: {
        job_name: PRICE_CHANGE_NOTICE_LOCK,
        locked_at: now,
        expires_at: new Date(now.getTime() + PRICE_CHANGE_NOTICE_LOCK_TTL_MS),
        locked_by: lockedBy,
      },
      update: {
        locked_at: now,
        expires_at: new Date(now.getTime() + PRICE_CHANGE_NOTICE_LOCK_TTL_MS),
        locked_by: lockedBy,
      },
    });
    const lock = await prisma.cronLock.findUnique({ where: { job_name: PRICE_CHANGE_NOTICE_LOCK } });
    return lock?.locked_by === lockedBy && lock.expires_at > now;
  } catch {
    return false;
  }
}

async function releasePriceChangeNoticeLock(): Promise<void> {
  await prisma.cronLock
    .delete({ where: { job_name: PRICE_CHANGE_NOTICE_LOCK } })
    .catch(() => {/* already gone */});
}

/**
 * Find active subscriptions renewing within the next 7 days whose plan's
 * current amount differs from what was actually charged last period, and
 * email the merchant a heads-up before that new price takes effect.
 * Idempotent via `price_change_notice_sent_at`; call this from a daily cron.
 */
export async function sendUpcomingSubscriptionPriceChangeNotices(): Promise<PriceChangeNoticeResult> {
  const result: PriceChangeNoticeResult = { processed: 0, notified: 0, errors: [] };

  const lockedBy = `${process.env.HOSTNAME ?? "app"}:${process.pid}`;
  const acquired = await acquirePriceChangeNoticeLock(lockedBy);
  if (!acquired) {
    console.log("[PlanService] Price-change notice lock held by another instance — skipping.");
    return result;
  }

  try {
    const now = new Date();
    const windowEnd = new Date(
      now.getTime() + PRICE_CHANGE_NOTICE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const candidates = await prisma.merchantSubscription.findMany({
      where: {
        status: "active",
        next_billing_date: { gt: now, lte: windowEnd },
        price_change_notice_sent_at: null,
      },
      include: { merchant: true, plan: true },
    });

    result.processed = candidates.length;

    for (const sub of candidates) {
      try {
        const oldAmount = sub.current_period_amount;
        const newAmount = sub.plan.amount;

        // Only notify when the plan price actually increased -- a decrease
        // or an unchanged price needs no advance warning.
        if (oldAmount === null || newAmount.lte(oldAmount)) continue;

        if (sub.merchant.email_notifications_enabled) {
          await sendSubscriptionPriceChangeNoticeEmail(
            sub.merchant.email,
            sub.merchant.business_name,
            {
              subscription_id: sub.id,
              plan_name: sub.plan.name,
              old_amount: oldAmount.toString(),
              new_amount: newAmount.toString(),
              currency: sub.plan.currency,
              renewal_date: sub.next_billing_date.toISOString(),
            },
          );
        }

        await prisma.merchantSubscription.update({
          where: { id: sub.id },
          data: { price_change_notice_sent_at: now },
        });

        result.notified++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push({ subscriptionId: sub.id, error: msg });
      }
    }
  } finally {
    await releasePriceChangeNoticeLock();
  }

  return result;
}
