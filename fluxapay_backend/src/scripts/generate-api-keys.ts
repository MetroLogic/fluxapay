/**
 * Migration script to generate hashed API keys for existing merchants.
 * Finds merchants missing api_key_hashed and provisions a new key pair.
 *
 * Usage: npx ts-node src/scripts/generate-api-keys.ts
 */

import { PrismaClient } from "../generated/client/client";
import {
  generateApiKey,
  hashKey,
  getLastFour,
} from "../helpers/crypto.helper";

const prisma = new PrismaClient();

async function generateApiKeysForExistingMerchants() {
  try {
    console.log("Finding merchants without hashed API keys...");

    const merchantsWithoutKeys = await prisma.merchant.findMany({
      where: { api_key_hashed: null },
      select: {
        id: true,
        business_name: true,
        email: true,
      },
    });

    if (merchantsWithoutKeys.length === 0) {
      console.log("All merchants already have hashed API keys.");
      return;
    }

    console.log(`Found ${merchantsWithoutKeys.length} merchants without hashed API keys`);
    console.log("Generating hashed API keys...\n");

    let successCount = 0;
    let errorCount = 0;

    for (const merchant of merchantsWithoutKeys) {
      try {
        const rawKey = generateApiKey();
        const hashedKey = await hashKey(rawKey);
        const lastFour = getLastFour(rawKey);

        await prisma.merchant.update({
          where: { id: merchant.id },
          data: {
            api_key_hashed: hashedKey,
            api_key_last_four: lastFour,
          },
        });

        // Log only the masked key for auditing — never the raw key
        console.log(
          `Generated key for: ${merchant.business_name} (${merchant.email}) — sk_live_****${lastFour}`,
        );
        successCount++;
      } catch (error) {
        console.error(`Failed to generate key for: ${merchant.business_name} (${merchant.email})`);
        console.error(`   Error: ${error}`);
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log(`Successfully generated: ${successCount} API keys`);
    if (errorCount > 0) {
      console.log(`Failed: ${errorCount} API keys`);
    }
    console.log("=".repeat(50));

  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

generateApiKeysForExistingMerchants()
  .then(() => {
    console.log("\nScript completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });
