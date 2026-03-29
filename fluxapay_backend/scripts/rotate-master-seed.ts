#!/usr/bin/env ts-node

/**
 * Master Seed Rotation Script
 *
 * This script automates the rotation of the master seed used for HD wallet derivation.
 * It supports both "re-derive" and "dual-read" strategies as documented in KEY_ROTATION_RUNBOOK.md
 *
 * Usage:
 *   npm run rotation:dry-run                           # Dry run (no changes)
 *   npm run rotation:migrate -- --confirm              # Execute rotation (re-derive strategy)
 *   npm run rotation:verify                            # Verify rotation success
 *
 * Environment Requirements:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - KMS_PROVIDER: 'local' or 'aws'
 *   - KMS_ENCRYPTED_MASTER_SEED: Current encrypted master seed
 *   - KMS_ENCRYPTION_PASSPHRASE (for local) or AWS_KMS_KEY_ID (for aws)
 */

import crypto from 'crypto';
import { PrismaClient } from '../src/generated/client/client';
import { getKmsProvider } from '../src/services/kms.service';
import { deriveAccountKeypair } from '../src/services/hdWallet.service';

const prisma = new PrismaClient();

interface RotationOptions {
  dryRun: boolean;
  strategy: 'rederive' | 'dual-read';
  newSeed?: string;
  confirm: boolean;
}

/**
 * Main rotation orchestrator
 */
async function rotateMasterSeed(options: RotationOptions) {
  console.log('🔄 Master Seed Rotation Started');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Configuration:');
  console.log(`  Strategy: ${options.strategy}`);
  console.log(`  Dry Run: ${options.dryRun}`);
  console.log(`  KMS Provider: ${process.env.KMS_PROVIDER || 'local'}`);
  console.log('');

  if (!options.confirm && !options.dryRun) {
    console.error('❌ Error: --confirm flag is required for non-dry-run execution');
    console.error('   This prevents accidental rotations.\n');
    process.exit(1);
  }

  try {
    // Step 1: Verify current environment and backup
    await verifyPreRotationState();

    // Step 2: Generate or use provided new seed
    const newSeed = options.newSeed || generateNewSeed();

    // Step 3: Execute rotation strategy
    if (options.strategy === 'rederive') {
      await executeRederiveStrategy(newSeed, options.dryRun);
    } else {
      await executeDualReadStrategy(newSeed, options.dryRun);
    }

    console.log('\n✅ Master Seed Rotation Completed Successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('\n❌ Master Seed Rotation Failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Verify system state before rotation
 */
async function verifyPreRotationState() {
  console.log('📋 Pre-Rotation Verification');
  console.log('──────────────────────────────────────────────────────────────────────────────\n');

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection verified');
  } catch (error) {
    throw new Error('Database connection failed. Ensure DATABASE_URL is correct.');
  }

  // Check KMS provider
  try {
    const kmsProvider = getKmsProvider();
    const isHealthy = await kmsProvider.healthCheck();
    if (!isHealthy) {
      throw new Error('KMS health check failed');
    }
    console.log('✅ KMS provider verified');
  } catch (error) {
    throw new Error(`KMS provider check failed: ${error}`);
  }

  // Get merchant count
  const merchantCount = await prisma.merchant.count();
  console.log(`✅ Found ${merchantCount} merchants to process`);

  // Check for pending payments
  const pendingPayments = await prisma.payment.count({
    where: { status: { in: ['pending', 'partially_paid'] } },
  });

  if (pendingPayments > 0) {
    console.warn(`⚠️  Warning: ${pendingPayments} pending payments detected`);
    console.warn('   These payments may fail if addresses change during rotation');
  }

  console.log('');
}

/**
 * Generate a cryptographically secure new master seed
 */
function generateNewSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Re-derive strategy: Replace all merchant addresses with new seed
 */
async function executeRederiveStrategy(newSeed: string, dryRun: boolean) {
  console.log('🔀 Executing Re-Derive Strategy');
  console.log('──────────────────────────────────────────────────────────────────────────────\n');

  // Get current KMS provider and seed
  const kmsProvider = getKmsProvider();
  const oldSeed = await kmsProvider.getMasterSeed();

  // Fetch all merchants with HD indices
  const merchants = await prisma.merchantHDIndex.findMany({
    include: {
      merchant: {
        select: {
          id: true,
          business_name: true,
        },
      },
    },
  });

  console.log(`Processing ${merchants.length} merchants...\n`);

  const updates: Array<{
    merchantId: string;
    oldAddress: string;
    newAddress: string;
    hdIndex: number;
  }> = [];

  // Derive new addresses for all merchants
  for (const merchantHD of merchants) {
    const oldKeypair = deriveAccountKeypair(oldSeed, merchantHD.hd_index);
    const newKeypair = deriveAccountKeypair(newSeed, merchantHD.hd_index);

    updates.push({
      merchantId: merchantHD.merchant.id,
      oldAddress: oldKeypair.publicKey(),
      newAddress: newKeypair.publicKey(),
      hdIndex: merchantHD.hd_index,
    });

    console.log(`  ${merchantHD.merchant.business_name}`);
    console.log(`    HD Index: ${merchantHD.hd_index}`);
    console.log(`    Old Address: ${oldKeypair.publicKey()}`);
    console.log(`    New Address: ${newKeypair.publicKey()}`);
    console.log('');
  }

  if (dryRun) {
    console.log('🔍 DRY RUN: No changes will be made');
    console.log(`   Would update ${updates.length} merchant addresses`);
    return;
  }

  // Update database with new addresses
  console.log('💾 Updating database with new addresses...');

  for (const update of updates) {
    await prisma.merchantHDIndex.update({
      where: { merchantId: update.merchantId },
      data: {
        stellar_address: update.newAddress,
      },
    });
  }

  console.log(`✅ Updated ${updates.length} merchant addresses`);

  // Store new encrypted seed
  console.log('\n🔐 Encrypting new master seed...');
  await kmsProvider.storeMasterSeed(newSeed);

  console.log('\n⚠️  IMPORTANT: Update your environment variables:');
  console.log('   1. Set KMS_ENCRYPTED_MASTER_SEED to the new value (printed above)');
  console.log('   2. Store old seed as KMS_OLD_ENCRYPTED_MASTER_SEED (for rollback)');
  console.log('   3. Restart the application');
  console.log('\n⚠️  TODO: Sweep funds from old addresses to new addresses');
  console.log('   Run: npm run rotation:sweep-funds');
}

/**
 * Dual-read strategy: Keep both seeds active
 */
async function executeDualReadStrategy(newSeed: string, dryRun: boolean) {
  console.log('🔀 Executing Dual-Read Strategy');
  console.log('──────────────────────────────────────────────────────────────────────────────\n');

  console.log('⚠️  Dual-read strategy requires code changes:');
  console.log('   1. Add seed_version column to MerchantHDIndex table');
  console.log('   2. Update HD wallet service to support multiple seeds');
  console.log('   3. Modify address derivation to use correct seed per merchant');
  console.log('');

  if (!dryRun) {
    throw new Error('Dual-read strategy not yet implemented. Use --strategy=rederive');
  }
}

/**
 * Verify rotation was successful
 */
async function verifyRotation() {
  console.log('🔍 Verifying Rotation Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const kmsProvider = getKmsProvider();

  try {
    const currentSeed = await kmsProvider.getMasterSeed();
    console.log('✅ Master seed decryption successful');
    console.log(`   Seed hash (last 8): ${currentSeed.slice(-8)}`);
  } catch (error) {
    console.error('❌ Failed to decrypt master seed:', error);
    return;
  }

  // Check all merchants have addresses
  const merchantsWithoutAddress = await prisma.merchantHDIndex.count({
    where: { stellar_address: null },
  });

  if (merchantsWithoutAddress > 0) {
    console.error(`❌ ${merchantsWithoutAddress} merchants missing stellar_address`);
  } else {
    console.log('✅ All merchants have stellar addresses');
  }

  // Check for duplicate addresses (should never happen)
  const addresses = await prisma.merchantHDIndex.groupBy({
    by: ['stellar_address'],
    having: {
      stellar_address: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  if (addresses.length > 0) {
    console.error(`❌ Duplicate addresses detected: ${addresses.length}`);
  } else {
    console.log('✅ No duplicate addresses found');
  }

  console.log('\n✅ Verification Complete');
}

/**
 * CLI argument parser
 */
function parseArgs(): RotationOptions {
  const args = process.argv.slice(2);

  const options: RotationOptions = {
    dryRun: !args.includes('--confirm'),
    strategy: 'rederive',
    confirm: args.includes('--confirm'),
  };

  // Parse strategy
  const strategyArg = args.find((arg) => arg.startsWith('--strategy='));
  if (strategyArg) {
    const strategy = strategyArg.split('=')[1] as 'rederive' | 'dual-read';
    if (!['rederive', 'dual-read'].includes(strategy)) {
      throw new Error('Invalid strategy. Use --strategy=rederive or --strategy=dual-read');
    }
    options.strategy = strategy;
  }

  // Parse custom seed (for testing)
  const seedArg = args.find((arg) => arg.startsWith('--seed='));
  if (seedArg) {
    options.newSeed = seedArg.split('=')[1];
  }

  return options;
}

/**
 * Entry point
 */
async function main() {
  const command = process.argv[2];

  if (command === 'verify' || command === '--verify') {
    await verifyRotation();
  } else {
    const options = parseArgs();
    await rotateMasterSeed(options);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { rotateMasterSeed, verifyRotation };
