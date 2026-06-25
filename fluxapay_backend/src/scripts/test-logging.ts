/**
 * Manual Test Script for PII-Safe Logging
 * 
 * This script demonstrates the logging functionality with PII redaction.
 * Run with: npx ts-node src/scripts/test-logging.ts
 */

import { 
  redactAuthHeader, 
  redactApiKey, 
  hashMerchantId, 
  redactEmail 
} from '../utils/piiRedactor';

console.log('\n=== PII Redaction Examples ===\n');

// Test Authorization header redaction
console.log('1. Authorization Header Redaction:');
console.log('   Bearer Token:', redactAuthHeader('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0'));
console.log('   Basic Auth:', redactAuthHeader('Basic dXNlcm5hbWU6cGFzc3dvcmQ='));
console.log('   AccessKey:', redactAuthHeader('AccessKey ABCD1234EFGH5678IJKL'));
console.log('   Undefined:', redactAuthHeader(undefined));
console.log();

// Test API key redaction
console.log('2. API Key Redaction:');
console.log('   Long Key:', redactApiKey('sk_live_abcdefgh1234567890'));
console.log('   Short Key:', redactApiKey('short'));
console.log();

// Test merchant ID hashing
console.log('3. Merchant ID Hashing:');
const merchantId = 'merchant-12345-abcde';
console.log('   Original:', merchantId);
console.log('   Hashed:', hashMerchantId(merchantId));
console.log('   Consistent:', hashMerchantId(merchantId) === hashMerchantId(merchantId));
console.log();

// Test email redaction
console.log('4. Email Redaction:');
console.log('   Long email:', redactEmail('john.doe@example.com'));
console.log('   Short email:', redactEmail('ab@example.com'));
console.log('   Invalid:', redactEmail('invalid-email'));
console.log();

console.log('=== All examples completed successfully! ===\n');
