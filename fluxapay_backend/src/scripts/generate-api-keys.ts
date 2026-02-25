/**
 * Migration script to generate API keys for existing merchants
 * Run this after adding the api_key field to the Merchant model
 * 
 * Usage: npx ts-node src/scripts/generate-api-keys.ts
 */

import { PrismaClient } from "../generated/client/client";

const prisma = new PrismaClient();

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let apiKey = "fluxapay_live_";
  for (let i = 0; i < 32; i++) {
    apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return apiKey;
}

async function generateApiKeysForExistingMerchants() {
  try {
    console.log("🔍 Finding merchants without API keys...");
    
    // Find all merchants without an API key
    const merchantsWithoutKeys = await prisma.merchant.findMany({
      where: {
        api_key: null,
      },
      select: {
        id: true,
        business_name: true,
        email: true,
      },
    });

    if (merchantsWithoutKeys.length === 0) {
      console.log("✅ All merchants already have API keys!");
      return;
    }

    console.log(`📝 Found ${merchantsWithoutKeys.length} merchants without API keys`);
    console.log("🔑 Generating API keys...\n");

    let successCount = 0;
    let errorCount = 0;

    for (const merchant of merchantsWithoutKeys) {
      try {
        const apiKey = generateApiKey();
        
        await prisma.merchant.update({
          where: { id: merchant.id },
          data: { api_key: apiKey },
        });

        console.log(`✅ Generated API key for: ${merchant.business_name} (${merchant.email})`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to generate API key for: ${merchant.business_name} (${merchant.email})`);
        console.error(`   Error: ${error}`);
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log(`✅ Successfully generated: ${successCount} API keys`);
    if (errorCount > 0) {
      console.log(`❌ Failed: ${errorCount} API keys`);
    }
    console.log("=".repeat(50));

  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
generateApiKeysForExistingMerchants()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });
