/**
 * Migration script: backfill API keys for merchants created before Feature #101.
 *
 * Identifies all merchants with api_key_hashed = null, generates a unique
 * fluxapay_live_... key for each, hashes it with bcrypt, and persists the
 * hash + last-four to the DB without touching any other fields.
 *
 * Usage:
 *   # Preview (no writes)
 *   DRY_RUN=true ts-node src/scripts/backfill-api-keys.ts
 *
 *   # Apply
 *   ts-node src/scripts/backfill-api-keys.ts
 */

import { PrismaClient } from "../generated/client/client";
import { generateApiKey, hashKey, getLastFour } from "../helpers/crypto.helper";

const DRY_RUN = process.env.DRY_RUN === "true";

async function backfillApiKeys(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    console.log(`\n=== API Key Backfill Migration${DRY_RUN ? " [DRY RUN]" : ""} ===\n`);

    const merchants = await prisma.merchant.findMany({
      where: {
        OR: [{ api_key_hashed: null }, { api_key_hashed: "" }],
      },
      select: { id: true, business_name: true, email: true },
    });

    if (merchants.length === 0) {
      console.log("✓ All merchants already have API keys. Nothing to do.");
      return;
    }

    console.log(`Found ${merchants.length} merchant(s) without API keys.\n`);

    let succeeded = 0;
    let failed = 0;
    const failures: { id: string; email: string; error: string }[] = [];

    for (const merchant of merchants) {
      const label = `${merchant.business_name} <${merchant.email}> (${merchant.id})`;
      try {
        const rawKey = generateApiKey();
        const hashed = await hashKey(rawKey);
        const lastFour = getLastFour(rawKey);

        if (!DRY_RUN) {
          await prisma.merchant.update({
            where: { id: merchant.id },
            data: { api_key_hashed: hashed, api_key_last_four: lastFour },
          });
        }

        console.log(`  ${DRY_RUN ? "[dry]" : "✓"} ${label} → sk_live_****${lastFour}`);
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${label} — ${message}`);
        failures.push({ id: merchant.id, email: merchant.email, error: message });
        failed++;
      }
    }

    console.log("\n" + "─".repeat(60));
    console.log(`Total found  : ${merchants.length}`);
    console.log(`Succeeded    : ${succeeded}`);
    console.log(`Failed       : ${failed}`);
    if (DRY_RUN) {
      console.log("\n⚠  Dry-run mode — no changes were written to the database.");
      console.log("   Re-run without DRY_RUN=true to apply.\n");
    } else {
      console.log(`\n✓ Migration complete.\n`);
    }

    if (failures.length > 0) {
      console.error("Failed merchants:");
      failures.forEach((f) => console.error(`  - ${f.email} (${f.id}): ${f.error}`));
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

backfillApiKeys().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
