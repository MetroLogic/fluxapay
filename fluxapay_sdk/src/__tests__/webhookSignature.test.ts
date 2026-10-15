/**
 * Vitest suite for webhooks.verifySignature.
 *
 * The vectors below are fixed HMAC-SHA256 values computed independently of
 * this SDK, so a regression in the signing-string format is caught even if
 * computeSignature() itself changes.
 *
 * Run with: npm run test:webhook-signature
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FluxaPay, {
  computeSignature,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  SignatureVerificationError,
  TimestampToleranceError,
  WebhookVerificationError,
  verifySignature,
  webhooks,
} from '../index';

// ── Test vectors ─────────────────────────────────────────────────────────────

const SECRET = 'whsec_test_4eC39HqLyjWDarjtT1zdp7dc';
const BODY =
  '{"event":"payment_confirmed","payment_id":"pay_123","merchant_id":"m_1",' +
  '"timestamp":"2026-01-01T00:00:00.000Z","data":{"amount":100}}';

const ISO_TS = '2026-01-01T00:00:00.000Z';
const ISO_SIG = '40ed3922aaf540bcf16a7aee1a865c001719d15a9cb23bc32acde26b06f9dd76';

const UNIX_TS = '1767225600'; // same instant as ISO_TS
const UNIX_SIG = '7f7e48e06eea7557fe203dbc974cc3e189f3e024655753cd28f1e699b4aa5c8b';

const NOW_MS = Date.parse(ISO_TS);

function headers(signature: string, timestamp: string) {
  return { 'x-fluxapay-signature': signature, 'x-fluxapay-timestamp': timestamp };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Vectors ──────────────────────────────────────────────────────────────────

describe('computeSignature', () => {
  it('matches the ISO-timestamp test vector', () => {
    expect(computeSignature(BODY, ISO_TS, SECRET)).toBe(ISO_SIG);
  });

  it('matches the Unix-timestamp test vector', () => {
    expect(computeSignature(BODY, UNIX_TS, SECRET)).toBe(UNIX_SIG);
  });

  it('signs Buffers and strings identically', () => {
    expect(computeSignature(Buffer.from(BODY, 'utf8'), ISO_TS, SECRET)).toBe(ISO_SIG);
  });

  it('matches a minimal vector', () => {
    expect(computeSignature('{}', ISO_TS, 'secret')).toBe(
      'ce7d77f5e3be4cbfc1681d9263bfbdc3a4acbb1e328635827419b742a4e37a43',
    );
  });
});

// ── Happy paths ──────────────────────────────────────────────────────────────

describe('verifySignature – valid signatures', () => {
  it('accepts request headers and returns the parsed event', () => {
    const event = verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET);
    expect(event.event).toBe('payment_confirmed');
    expect(event.payment_id).toBe('pay_123');
  });

  it('looks up headers case-insensitively and takes the first array value', () => {
    const event = verifySignature(
      BODY,
      { 'X-FluxaPay-Signature': [ISO_SIG, 'ignored'], 'X-FluxaPay-Timestamp': ISO_TS },
      SECRET,
    );
    expect(event.payment_id).toBe('pay_123');
  });

  it('accepts an explicit { signature, timestamp } pair', () => {
    expect(() => verifySignature(BODY, { signature: ISO_SIG, timestamp: ISO_TS }, SECRET)).not.toThrow();
  });

  it('accepts a combined t=...,v1=... header', () => {
    expect(() => verifySignature(BODY, `t=${ISO_TS},v1=${ISO_SIG}`, SECRET)).not.toThrow();
  });

  it('accepts any matching v1 entry (secret rotation)', () => {
    const stale = 'a'.repeat(64);
    expect(() => verifySignature(BODY, `t=${ISO_TS},v1=${stale},v1=${ISO_SIG}`, SECRET)).not.toThrow();
  });

  it('accepts Unix-seconds timestamps', () => {
    expect(() => verifySignature(BODY, headers(UNIX_SIG, UNIX_TS), SECRET)).not.toThrow();
  });

  it('accepts upper-case hex signatures', () => {
    expect(() => verifySignature(BODY, headers(ISO_SIG.toUpperCase(), ISO_TS), SECRET)).not.toThrow();
  });

  it('accepts a Buffer body', () => {
    const event = verifySignature(Buffer.from(BODY), headers(ISO_SIG, ISO_TS), SECRET);
    expect(event.event).toBe('payment_confirmed');
  });
});

// ── Signature failures ───────────────────────────────────────────────────────

describe('verifySignature – SignatureVerificationError', () => {
  const cases: Array<[string, () => unknown]> = [
    ['wrong secret', () => verifySignature(BODY, headers(ISO_SIG, ISO_TS), 'whsec_wrong')],
    ['tampered body', () => verifySignature(BODY.replace('100', '999'), headers(ISO_SIG, ISO_TS), SECRET)],
    ['tampered timestamp', () => verifySignature(BODY, headers(ISO_SIG, '2026-01-01T00:00:01.000Z'), SECRET)],
    ['signature for another timestamp format', () => verifySignature(BODY, headers(UNIX_SIG, ISO_TS), SECRET)],
    ['truncated signature', () => verifySignature(BODY, headers(ISO_SIG.slice(0, 63), ISO_TS), SECRET)],
    ['non-hex signature', () => verifySignature(BODY, headers('z'.repeat(64), ISO_TS), SECRET)],
    ['empty signature', () => verifySignature(BODY, headers('', ISO_TS), SECRET)],
    ['missing signature header', () => verifySignature(BODY, { 'x-fluxapay-timestamp': ISO_TS }, SECRET)],
    ['missing timestamp header', () => verifySignature(BODY, { 'x-fluxapay-signature': ISO_SIG }, SECRET)],
    ['bare signature string without timestamp', () => verifySignature(BODY, ISO_SIG, SECRET)],
    ['combined header without v1', () => verifySignature(BODY, `t=${ISO_TS}`, SECRET)],
    ['empty headers object', () => verifySignature(BODY, {}, SECRET)],
    ['null header', () => verifySignature(BODY, null as unknown as string, SECRET)],
  ];

  it.each(cases)('rejects %s', (_label, run) => {
    expect(run).toThrow(SignatureVerificationError);
    expect(run).toThrow(WebhookVerificationError);
  });

  it('checks the signature before the timestamp', () => {
    vi.setSystemTime(NOW_MS + 3600_000);
    expect(() => verifySignature(BODY, headers('b'.repeat(64), ISO_TS), SECRET)).toThrow(
      SignatureVerificationError,
    );
  });

  it('rejects a correctly signed body that is not JSON', () => {
    const body = 'not json';
    const sig = computeSignature(body, ISO_TS, SECRET);
    expect(() => verifySignature(body, headers(sig, ISO_TS), SECRET)).toThrow(SignatureVerificationError);
  });

  it('rejects a correctly signed but unparseable timestamp', () => {
    const ts = 'yesterday';
    const sig = computeSignature(BODY, ts, SECRET);
    expect(() => verifySignature(BODY, headers(sig, ts), SECRET)).toThrow(SignatureVerificationError);
  });

  it('uses crypto.timingSafeEqual for the comparison', async () => {
    const crypto = await import('crypto');
    const spy = vi.spyOn(crypto.default, 'timingSafeEqual');
    verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Timestamp tolerance ──────────────────────────────────────────────────────

describe('verifySignature – TimestampToleranceError', () => {
  it('defaults to a 300 second tolerance', () => {
    expect(DEFAULT_WEBHOOK_TOLERANCE_SECONDS).toBe(300);

    vi.setSystemTime(NOW_MS + 300_000);
    expect(() => verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET)).not.toThrow();

    vi.setSystemTime(NOW_MS + 301_000);
    expect(() => verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET)).toThrow(TimestampToleranceError);
  });

  it('exposes the timestamp, tolerance and age on the error', () => {
    vi.setSystemTime(NOW_MS + 600_000);
    try {
      verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET);
      expect.unreachable('expected TimestampToleranceError');
    } catch (err) {
      expect(err).toBeInstanceOf(TimestampToleranceError);
      expect(err).toBeInstanceOf(WebhookVerificationError);
      const e = err as TimestampToleranceError;
      expect(e.name).toBe('TimestampToleranceError');
      expect(e.timestamp).toBe(ISO_TS);
      expect(e.toleranceSeconds).toBe(300);
      expect(e.ageSeconds).toBe(600);
    }
  });

  it('rejects timestamps too far in the future', () => {
    vi.setSystemTime(NOW_MS - 301_000);
    expect(() => verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET)).toThrow(TimestampToleranceError);
  });

  it('honours a custom tolerance', () => {
    vi.setSystemTime(NOW_MS + 30_000);
    expect(() => verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET, 10)).toThrow(TimestampToleranceError);
    expect(() => verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET, 60)).not.toThrow();
  });

  it('applies the tolerance to Unix-seconds timestamps', () => {
    vi.setSystemTime(NOW_MS + 301_000);
    expect(() => verifySignature(BODY, headers(UNIX_SIG, UNIX_TS), SECRET)).toThrow(TimestampToleranceError);
  });

  it('skips the replay check when tolerance is Infinity', () => {
    vi.setSystemTime(NOW_MS + 365 * 24 * 3600_000);
    expect(() => verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET, Infinity)).not.toThrow();
  });
});

// ── Argument validation ──────────────────────────────────────────────────────

describe('verifySignature – argument validation', () => {
  it('requires a secret', () => {
    expect(() => verifySignature(BODY, headers(ISO_SIG, ISO_TS), '')).toThrow(TypeError);
  });

  it('rejects a negative or NaN tolerance', () => {
    expect(() => verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET, -1)).toThrow(TypeError);
    expect(() => verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET, NaN)).toThrow(TypeError);
  });

  it('rejects a parsed (non-raw) body', () => {
    const parsed = JSON.parse(BODY) as unknown as string;
    expect(() => verifySignature(parsed, headers(ISO_SIG, ISO_TS), SECRET)).toThrow(SignatureVerificationError);
  });
});

// ── Entry points ─────────────────────────────────────────────────────────────

describe('entry points', () => {
  it('is exposed as webhooks.verifySignature', () => {
    expect(webhooks.verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET).event).toBe('payment_confirmed');
  });

  it('is exposed on the client as fluxapay.webhooks.verifySignature', () => {
    const fluxapay = new FluxaPay({ apiKey: 'sk_test_123' });
    expect(fluxapay.webhooks.verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET).event).toBe(
      'payment_confirmed',
    );
    vi.setSystemTime(NOW_MS + 120_000);
    expect(() => fluxapay.webhooks.verifySignature(BODY, headers(ISO_SIG, ISO_TS), SECRET, 60)).toThrow(
      TimestampToleranceError,
    );
  });
});
