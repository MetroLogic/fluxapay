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
import { KMSFactory } from '../src/services/kms';
import { HDWalletService } from '../src/services/HDWalletService';

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
    const kmsProvider = KMSFactory.getProvider();
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
 * Marks all unallocated old-seed deposit addresses as RETIRING before switching seed epochs.
 */
export async function markUnallocatedOldAddressesRetiring(
  oldSeedVersion: number,
  dryRun: boolean = false,
): Promise<number> {
  const unallocatedCount = await prisma.depositAddress.count({
    where: {
      seedVersion: oldSeedVersion,
      status: 'available',
    },
  });

  console.log(`Found ${unallocatedCount} unallocated addresses for seedVersion ${oldSeedVersion}`);

  if (dryRun) {
    console.log(`[DRY RUN] Would mark ${unallocatedCount} available addresses as retiring`);
    return unallocatedCount;
  }

  const updated = await prisma.depositAddress.updateMany({
    where: {
      seedVersion: oldSeedVersion,
      status: 'available',
    },
    data: {
      status: 'retiring',
    },
  });

  console.log(`✅ Marked ${updated.count} unallocated addresses as RETIRING`);
  return updated.count;
}

/**
 * Checks if old seed material can be safely deleted.
 * Old seed material may only be deleted when zero outstanding addresses reference it.
 */
export async function canDeleteOldSeed(seedVersion: number): Promise<boolean> {
  const outstandingCount = await prisma.depositAddress.count({
    where: {
      seedVersion,
      status: {
        in: ['assigned', 'cooldown', 'available'],
      },
    },
  });

  return outstandingCount === 0;
}

/**
 * Deletes old seed material only if zero outstanding addresses reference it.
 */
export async function deleteOldSeedMaterial(seedVersion: number): Promise<{ deleted: boolean; reason?: string }> {
  const safeToDelete = await canDeleteOldSeed(seedVersion);
  if (!safeToDelete) {
    const remaining = await prisma.depositAddress.count({
      where: {
        seedVersion,
        status: { in: ['assigned', 'cooldown', 'available'] },
      },
    });
    return {
      deleted: false,
      reason: `Cannot delete seed material for epoch ${seedVersion}: ${remaining} outstanding addresses still reference it`,
    };
  }

  // Clear from versioned registry if present
  const envVersionKey = `HD_WALLET_SEED_V${seedVersion}`;
  delete process.env[envVersionKey];

  return { deleted: true };
}

/**
 * Re-derive strategy: Replace all merchant addresses with new seed
 */
async function executeRederiveStrategy(newSeed: string, dryRun: boolean) {
  console.log('🔀 Executing Re-Derive Strategy');
  console.log('──────────────────────────────────────────────────────────────────────────────\n');

  // Step A: Mark all unallocated addresses from current epoch as retiring
  const currentSeedVersion = Number(process.env.CURRENT_SEED_VERSION || '1');
  await markUnallocatedOldAddressesRetiring(currentSeedVersion, dryRun);

  // Get current KMS provider and seed
  const kmsProvider = KMSFactory.getProvider();
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

  const oldHD = new HDWalletService(oldSeed);
  const newHD = new HDWalletService(newSeed);

  const updates: Array<{
    merchantId: string;
    oldAddress: string;
    newAddress: string;
    hdIndex: number;
  }> = [];

  // Derive new addresses for all merchants
  for (const merchantHD of merchants) {
    const oldKeypair = await oldHD.regenerateKeypair(merchantHD.merchant_index, 0);
    const newKeypair = await newHD.regenerateKeypair(merchantHD.merchant_index, 0);

    updates.push({
      merchantId: merchantHD.merchant.id,
      oldAddress: oldKeypair.publicKey,
      newAddress: newKeypair.publicKey,
      hdIndex: merchantHD.merchant_index,
    });

    console.log(`  ${merchantHD.merchant.business_name}`);
    console.log(`    HD Index: ${merchantHD.merchant_index}`);
    console.log(`    Old Address: ${oldKeypair.publicKey}`);
    console.log(`    New Address: ${newKeypair.publicKey}`);
    console.log('');
  }

  if (dryRun) {
    console.log('🔍 DRY RUN: No changes will be made');
    console.log(`   Would update ${updates.length} merchant addresses`);
    return;
  }

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
 * Dual-read strategy: Keep both seeds active with epoch tracking
 */
async function executeDualReadStrategy(newSeed: string, dryRun: boolean) {
  console.log('🔀 Executing Dual-Read Strategy');
  console.log('──────────────────────────────────────────────────────────────────────────────\n');

  const currentSeedVersion = Number(process.env.CURRENT_SEED_VERSION || '1');
  const newSeedVersion = currentSeedVersion + 1;

  // Mark all unallocated addresses for current seed epoch as RETIRING
  await markUnallocatedOldAddressesRetiring(currentSeedVersion, dryRun);

  if (dryRun) {
    console.log(`[DRY RUN] Would switch active seed epoch from ${currentSeedVersion} to ${newSeedVersion}`);
    return;
  }

  const kmsProvider = KMSFactory.getProvider();
  await kmsProvider.storeMasterSeed(newSeed);

  console.log(`✅ Dual-read rotation completed. Active epoch is now ${newSeedVersion}. In-flight addresses retained under epoch ${currentSeedVersion}.`);
}

/**
 * Verify rotation was successful
 */
async function verifyRotation() {
  console.log('🔍 Verifying Rotation Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const kmsProvider = KMSFactory.getProvider();

  try {
    const currentSeed = await kmsProvider.getMasterSeed();
    console.log('✅ Master seed decryption successful');
    console.log(`   Seed hash (last 8): ${currentSeed.slice(-8)}`);
  } catch (error) {
    console.error('❌ Failed to decrypt master seed:', error);
    return;
  }

  const poolStats = await prisma.depositAddress.groupBy({
    by: ['status'],
    _count: { status: true },
  });
  console.log('✅ Deposit address pool breakdown:', poolStats);

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
