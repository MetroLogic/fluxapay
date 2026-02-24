#!/usr/bin/env ts-node
/**
 * CLI Tool for Encrypting HD Wallet Master Seed
 * 
 * Usage:
 *   npm run encrypt-seed
 * 
 * This tool helps you encrypt your master seed for secure storage.
 */

import * as readline from 'readline';
import { LocalKMSProvider } from '../services/kms/LocalKMSProvider';
import { AWSKMSProvider } from '../services/kms/AWSKMSProvider';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FluxaPay HD Wallet Master Seed Encryption Tool');
  console.log('═══════════════════════════════════════════════════════\n');

  const provider = await question('Select KMS provider (local/aws): ');

  if (provider.toLowerCase() === 'local') {
    await encryptWithLocalKMS();
  } else if (provider.toLowerCase() === 'aws') {
    await encryptWithAWSKMS();
  } else {
    console.error('Invalid provider. Choose "local" or "aws".');
    process.exit(1);
  }

  rl.close();
}

async function encryptWithLocalKMS() {
  console.log('\n📦 Local KMS Encryption\n');
  
  const passphrase = await question('Enter encryption passphrase: ');
  const masterSeed = await question('Enter master seed to encrypt: ');

  if (!masterSeed || masterSeed.length < 32) {
    console.error('❌ Master seed must be at least 32 characters long.');
    process.exit(1);
  }

  const kms = new LocalKMSProvider(passphrase);
  await kms.storeMasterSeed(masterSeed);

  console.log('\n✅ Encryption complete!');
  console.log('\nAdd these to your .env file:');
  console.log(`KMS_PROVIDER=local`);
  console.log(`KMS_ENCRYPTION_PASSPHRASE=${passphrase}`);
  console.log('\n⚠️  Keep the passphrase secure and separate from the encrypted seed!');
}

async function encryptWithAWSKMS() {
  console.log('\n☁️  AWS KMS Encryption\n');
  
  const keyId = await question('Enter AWS KMS Key ID (ARN): ');
  const region = await question('Enter AWS region (default: us-east-1): ') || 'us-east-1';
  const masterSeed = await question('Enter master seed to encrypt: ');

  if (!masterSeed || masterSeed.length < 32) {
    console.error('❌ Master seed must be at least 32 characters long.');
    process.exit(1);
  }

  try {
    const kms = new AWSKMSProvider(keyId, region);
    await kms.storeMasterSeed(masterSeed);

    console.log('\n✅ Encryption complete!');
    console.log('\nAdd these to your .env file:');
    console.log(`KMS_PROVIDER=aws`);
    console.log(`AWS_KMS_KEY_ID=${keyId}`);
    console.log(`AWS_REGION=${region}`);
    console.log('\n⚠️  Ensure your AWS credentials have kms:Decrypt permission!');
  } catch (error) {
    console.error('❌ AWS KMS encryption failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
