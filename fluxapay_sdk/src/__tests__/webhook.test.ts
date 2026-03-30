/**
 * Unit tests for the standalone verifyWebhookSignature helper.
 *
 * Uses deterministic fixtures so results are reproducible without a running server.
 * Run with: npm run test:unit
 */
import crypto from 'crypto';
import { verifyWebhookSignature } from '../index';

// ── Helpers ──────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    pass++;
  } else {
    console.error(`  ✗  ${label}`);
    fail++;
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SECRET = 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const PAYLOAD = JSON.stringify({ event: 'payment_confirmed', payment_id: 'pay_123' });

/** Generate a fresh timestamp within the tolerance window. */
function freshTimestamp(): string {
  return new Date().toISOString();
}

/** Compute the correct HMAC-SHA256 signature matching the backend format. */
function sign(payload: string, timestamp: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nverifyWebhookSignature – unit tests\n');

// Happy path
const ts = freshTimestamp();
const sig = sign(PAYLOAD, ts, SECRET);

assert(
  verifyWebhookSignature(PAYLOAD, sig, ts, SECRET).valid === true,
  'valid signature returns { valid: true }',
);

// Wrong secret
assert(
  verifyWebhookSignature(PAYLOAD, sig, ts, 'wrong_secret').valid === false,
  'wrong secret returns { valid: false }',
);

// Tampered payload
assert(
  verifyWebhookSignature(PAYLOAD + ' ', sig, ts, SECRET).valid === false,
  'tampered payload returns { valid: false }',
);

// Bad signature string
const result = verifyWebhookSignature(PAYLOAD, 'deadbeef', ts, SECRET);
assert(result.valid === false, 'bad signature returns { valid: false }');
assert(typeof result.error === 'string', 'error field is a string on failure');

// Replay protection – timestamp older than tolerance
const oldTs = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
const oldSig = sign(PAYLOAD, oldTs, SECRET);
const replayResult = verifyWebhookSignature(PAYLOAD, oldSig, oldTs, SECRET, { toleranceSeconds: 300 });
assert(replayResult.valid === false, 'timestamp older than tolerance is rejected');
assert(
  replayResult.error?.includes('older than') === true,
  'replay error message mentions "older than"',
);

// Future timestamp
const futureTs = new Date(Date.now() + 60 * 1000).toISOString();
const futureSig = sign(PAYLOAD, futureTs, SECRET);
const futureResult = verifyWebhookSignature(PAYLOAD, futureSig, futureTs, SECRET);
assert(futureResult.valid === false, 'future timestamp is rejected');
assert(
  futureResult.error?.includes('future') === true,
  'future timestamp error message mentions "future"',
);

// Custom tolerance window
const recentTs = new Date(Date.now() - 30 * 1000).toISOString(); // 30 s ago
const recentSig = sign(PAYLOAD, recentTs, SECRET);
assert(
  verifyWebhookSignature(PAYLOAD, recentSig, recentTs, SECRET, { toleranceSeconds: 60 }).valid === true,
  'timestamp within custom tolerance window is accepted',
);

// Missing parameters
assert(
  verifyWebhookSignature('', sig, ts, SECRET).valid === false,
  'empty rawBody returns { valid: false }',
);
assert(
  verifyWebhookSignature(PAYLOAD, '', ts, SECRET).valid === false,
  'empty signature returns { valid: false }',
);
assert(
  verifyWebhookSignature(PAYLOAD, sig, '', SECRET).valid === false,
  'empty timestamp returns { valid: false }',
);
assert(
  verifyWebhookSignature(PAYLOAD, sig, ts, '').valid === false,
  'empty secret returns { valid: false }',
);

// Invalid timestamp format
assert(
  verifyWebhookSignature(PAYLOAD, sig, 'not-a-date', SECRET).valid === false,
  'invalid timestamp format returns { valid: false }',
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
