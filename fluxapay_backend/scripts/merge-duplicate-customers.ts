/**
 * One-time migration script to merge duplicate customer records per merchant.
 *
 * Strategy:
 * - For each merchant, find customers grouped by email (normalized lowercase).
 * - Keep the earliest created customer as the canonical record.
 * - Repoint payments and payment_links to the canonical customer id.
 * - Soft-delete the duplicate customer records (set deleted_at and anonymize email).
 *
 * Safety guard:
 * - Before merging, check both customers for active (PENDING or PROCESSING) payments.
 * - If found, skip the merge and log a warning (written to skipped-merges.json).
 * - Use --force to override the guard (a warning is still logged).
 *
 * IMPORTANT: Run this script once in a maintenance window and verify results before removing.
 *
 * Usage:
 *   npx ts-node scripts/merge-duplicate-customers.ts [--force]
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../src/generated/client/client';

const prisma = new PrismaClient();

/** Payment statuses that are not yet in a terminal state. */
const ACTIVE_PAYMENT_STATUSES = ['pending', 'processing', 'partially_paid'] as const;

interface SkippedMerge {
  merchantId: string;
  email: string;
  customerIds: string[];
  activePaymentIds: string[];
  reason: string;
  skippedAt: string;
}

async function main() {
  const force = process.argv.includes('--force');

  if (force) {
    console.warn('[WARN] --force flag set: active-payment guard is disabled. Proceeding with all merges.');
  }

  console.log('Starting duplicate customer merge...');

  const merchants = await prisma.merchant.findMany({ select: { id: true } });
  const skippedMerges: SkippedMerge[] = [];

  for (const m of merchants) {
    const merchantId = m.id;

    // Find customers grouped by normalized email
    const customers = await prisma.customer.findMany({
      where: { merchantId },
      orderBy: { created_at: 'asc' },
    });

    const grouped: Record<string, typeof customers> = {};

    customers.forEach((c) => {
      const key = (c.email || '').toLowerCase().trim();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    });

    for (const [email, list] of Object.entries(grouped)) {
      if (list.length <= 1) continue;

      const canonical = list[0];
      const duplicates = list.slice(1);
      const allIds = list.map((c) => c.id);

      // ── Active-payment guard ────────────────────────────────────────────────
      if (!force) {
        const activePayments = await prisma.payment.findMany({
          where: {
            customerId: { in: allIds },
            merchantId,
            status: { in: [...ACTIVE_PAYMENT_STATUSES] },
          },
          select: { id: true, status: true },
        });

        if (activePayments.length > 0) {
          const msg =
            `Skipping merge for merchant=${merchantId} email=${email}: ` +
            `${activePayments.length} active payment(s) found (${activePayments.map((p) => p.id).join(', ')}).`;
          console.warn(`[WARN] ${msg}`);

          skippedMerges.push({
            merchantId,
            email,
            customerIds: allIds,
            activePaymentIds: activePayments.map((p) => p.id),
            reason: msg,
            skippedAt: new Date().toISOString(),
          });
          continue;
        }
      } else {
        // --force: check anyway and warn, but do not skip
        const activePayments = await prisma.payment.findMany({
          where: {
            customerId: { in: allIds },
            merchantId,
            status: { in: [...ACTIVE_PAYMENT_STATUSES] },
          },
          select: { id: true },
        });
        if (activePayments.length > 0) {
          console.warn(
            `[WARN] --force: merging merchant=${merchantId} email=${email} despite ` +
              `${activePayments.length} active payment(s).`,
          );
        }
      }
      // ── End guard ───────────────────────────────────────────────────────────

      console.log(`Merging ${list.length} customers for merchant=${merchantId} email=${email}`);

      const duplicateIds = duplicates.map((d) => d.id);

      // Reassign payments and payment links to canonical customer
      await prisma.payment.updateMany({
        where: { customerId: { in: duplicateIds }, merchantId },
        data: { customerId: canonical.id },
      });

      await prisma.paymentLink.updateMany({
        where: { customerId: { in: duplicateIds }, merchantId },
        data: { customerId: canonical.id },
      });

      // Soft-delete duplicates and anonymize PII
      for (const dup of duplicates) {
        await prisma.customer.update({
          where: { id: dup.id },
          data: {
            deleted_at: new Date(),
            email: `merged-${dup.id}@merged.local`,
            name: null,
            phone: null,
            stellar_address: null,
            metadata: {},
          },
        });
      }
    }
  }

  // Write skipped-merges report
  if (skippedMerges.length > 0) {
    const reportPath = path.resolve(process.cwd(), 'skipped-merges.json');
    fs.writeFileSync(reportPath, JSON.stringify(skippedMerges, null, 2), 'utf-8');
    console.log(`\n[INFO] ${skippedMerges.length} merge(s) skipped. Report written to ${reportPath}`);
  }

  console.log('Duplicate customer merge complete.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
