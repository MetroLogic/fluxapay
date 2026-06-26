/**
 * One-time migration script to merge duplicate customer records per merchant.
 *
 * Strategy:
 * - For each merchant, find customers grouped by email (normalized lowercase).
 * - Keep the earliest created customer as the canonical record.
 * - Repoint payments and payment_links to the canonical customer id.
 * - Soft-delete the duplicate customer records (set deleted_at and anonymize email).
 *
 * IMPORTANT: Run this script once in a maintenance window and verify results before removing.
 */

import { PrismaClient } from '../src/generated/client/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting duplicate customer merge...');

  const merchants = await prisma.merchant.findMany({ select: { id: true } });

  for (const m of merchants) {
    const merchantId = m.id;

    // Find customers grouped by normalized email
    const customers = await prisma.customer.findMany({
      where: { merchantId },
      orderBy: { created_at: 'asc' },
    });

    const grouped: Record<string, any[]> = {};

    customers.forEach((c) => {
      const key = (c.email || '').toLowerCase().trim();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    });

    for (const [email, list] of Object.entries(grouped)) {
      if (list.length <= 1) continue;

      console.log(`Merging ${list.length} customers for merchant=${merchantId} email=${email}`);

      const canonical = list[0];
      const duplicates = list.slice(1);

      // Reassign payments and payment links
      const duplicateIds = duplicates.map((d) => d.id);

      await prisma.payment.updateMany({
        where: { customerId: { in: duplicateIds }, merchantId },
        data: { customerId: canonical.id },
      });

      await prisma.paymentLink.updateMany({
        where: { customerId: { in: duplicateIds }, merchantId },
        data: { customerId: canonical.id },
      });

      // Soft-delete duplicates and anonymize
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

  console.log('Duplicate customer merge complete');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
