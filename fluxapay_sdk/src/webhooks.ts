import crypto from 'crypto';
import type { WebhookEvent } from './index';

// ── Webhook signature verification ───────────────────────────────────────────
//
// FluxaPay signs every webhook delivery with the merchant's webhook secret:
//
//   X-FluxaPay-Timestamp: <timestamp>
//   X-FluxaPay-Signature: hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
//
// Binding the timestamp into the signed string means an attacker can neither
// forge a payload nor replay an old one with a fresh timestamp.

/** Default replay window, in seconds. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export const WEBHOOK_SIGNATURE_HEADER = 'x-fluxapay-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-fluxapay-timestamp';

/** Base class for every webhook verification failure. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/** The signature is missing, malformed, or does not match the payload. */
export class SignatureVerificationError extends WebhookVerificationError {
  constructor(message = 'Webhook signature verification failed') {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

/** The signature is valid but the timestamp is outside the tolerance window. */
export class TimestampToleranceError extends WebhookVerificationError {
  constructor(
    public readonly timestamp: string,
    public readonly toleranceSeconds: number,
    /** Positive when the webhook is in the past, negative when in the future. */
    public readonly ageSeconds: number,
  ) {
    super(
      ageSeconds >= 0
        ? `Webhook timestamp is ${Math.round(ageSeconds)}s old, outside the ${toleranceSeconds}s tolerance`
        : `Webhook timestamp is ${Math.round(-ageSeconds)}s in the future, outside the ${toleranceSeconds}s tolerance`,
    );
    this.name = 'TimestampToleranceError';
  }
}

type HeaderValue = string | string[] | undefined;

/**
 * Where to read the signature from. Accepts any of:
 *
 * - The incoming request headers (`req.headers`), which carry both
 *   `X-FluxaPay-Signature` and `X-FluxaPay-Timestamp`.
 * - An explicit `{ signature, timestamp }` pair.
 * - A combined header string `t=<timestamp>,v1=<hex>` (several `v1=` entries
 *   are allowed, e.g. while rotating secrets).
 */
export type WebhookSignatureHeader =
  | string
  | { signature: string; timestamp: string }
  | Record<string, HeaderValue>;

interface ParsedSignatureHeader {
  timestamp: string;
  signatures: string[];
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

function firstHeader(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getHeader(headers: Record<string, HeaderValue>, name: string): string | undefined {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) return firstHeader(headers[key]);
  }
  return undefined;
}

function parseCombinedHeader(header: string): ParsedSignatureHeader {
  let timestamp = '';
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }

  if (!timestamp && signatures.length === 0) {
    throw new SignatureVerificationError(
      'Signature header has no timestamp. Pass the request headers or { signature, timestamp } ' +
        'so the X-FluxaPay-Timestamp value can be verified.',
    );
  }
  return { timestamp, signatures };
}

function parseSignatureHeader(header: WebhookSignatureHeader): ParsedSignatureHeader {
  if (typeof header === 'string') return parseCombinedHeader(header);

  if (header === null || typeof header !== 'object') {
    throw new SignatureVerificationError('Missing webhook signature header');
  }

  const pair = header as { signature?: unknown; timestamp?: unknown };
  if (typeof pair.signature === 'string' || typeof pair.timestamp === 'string') {
    return {
      timestamp: typeof pair.timestamp === 'string' ? pair.timestamp.trim() : '',
      signatures: typeof pair.signature === 'string' ? [pair.signature.trim()] : [],
    };
  }

  const headers = header as Record<string, HeaderValue>;
  const signature = getHeader(headers, WEBHOOK_SIGNATURE_HEADER);
  const timestamp = getHeader(headers, WEBHOOK_TIMESTAMP_HEADER);
  return {
    timestamp: (timestamp ?? '').trim(),
    signatures: signature ? [signature.trim()] : [],
  };
}

/** Parses an ISO 8601 or Unix-seconds timestamp to epoch milliseconds. */
function parseTimestampMs(timestamp: string): number {
  if (/^\d+$/.test(timestamp)) return Number(timestamp) * 1000;
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) {
    throw new SignatureVerificationError(`Invalid webhook timestamp: ${timestamp}`);
  }
  return ms;
}

/**
 * Computes the signature FluxaPay sends for a payload. Useful for tests and
 * for local tooling that replays webhooks against your endpoint.
 */
export function computeSignature(rawBody: string | Buffer, timestamp: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
}

/**
 * Verifies a FluxaPay webhook and returns the parsed event.
 *
 * The signature is checked first with a constant-time comparison
 * (`crypto.timingSafeEqual`), then the timestamp is checked against
 * `toleranceSeconds` to block replays. Always pass the **raw** request body:
 * re-serialising parsed JSON changes the bytes and breaks the signature.
 *
 * @param rawBody          Raw request body exactly as received.
 * @param signatureHeader  `req.headers`, `{ signature, timestamp }`, or `t=...,v1=...`.
 * @param secret           Your webhook secret (`whsec_...`). Server-side only.
 * @param toleranceSeconds Max allowed clock difference in seconds (default 300).
 *                         Pass `Infinity` to skip the replay check.
 *
 * @throws {SignatureVerificationError} Missing, malformed, or mismatched signature.
 * @throws {TimestampToleranceError}    Valid signature, but the timestamp is too old
 *                                      (or too far in the future).
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { webhooks, SignatureVerificationError, TimestampToleranceError } from '@fluxapay/sdk';
 *
 * app.post('/webhooks/fluxapay', express.raw({ type: 'application/json' }), (req, res) => {
 *   try {
 *     const event = webhooks.verifySignature(req.body, req.headers, process.env.FLUXAPAY_WEBHOOK_SECRET!);
 *     // handle event.event ...
 *     res.sendStatus(200);
 *   } catch (err) {
 *     if (err instanceof SignatureVerificationError || err instanceof TimestampToleranceError) {
 *       return res.status(400).send(err.message);
 *     }
 *     throw err;
 *   }
 * });
 * ```
 */
export function verifySignature(
  rawBody: string | Buffer,
  signatureHeader: WebhookSignatureHeader,
  secret: string,
  toleranceSeconds: number = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
): WebhookEvent {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new TypeError('A webhook secret is required to verify signatures');
  }
  if (typeof toleranceSeconds !== 'number' || Number.isNaN(toleranceSeconds) || toleranceSeconds < 0) {
    throw new TypeError('toleranceSeconds must be a non-negative number');
  }
  if (rawBody === undefined || rawBody === null || (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody))) {
    throw new SignatureVerificationError('Webhook body must be the raw string or Buffer received');
  }
  if (signatureHeader === undefined || signatureHeader === null) {
    throw new SignatureVerificationError('Missing webhook signature header');
  }

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp) {
    throw new SignatureVerificationError('Missing webhook timestamp (X-FluxaPay-Timestamp)');
  }
  if (signatures.length === 0) {
    throw new SignatureVerificationError('Missing webhook signature (X-FluxaPay-Signature)');
  }

  const expected = Buffer.from(computeSignature(rawBody, timestamp, secret), 'utf8');

  // Compare against every candidate without short-circuiting.
  let matched = false;
  for (const candidate of signatures) {
    if (!HEX_SHA256.test(candidate)) continue;
    const received = Buffer.from(candidate.toLowerCase(), 'utf8');
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) {
      matched = true;
    }
  }
  if (!matched) {
    throw new SignatureVerificationError('Webhook signature does not match the payload');
  }

  if (Number.isFinite(toleranceSeconds)) {
    const ageSeconds = (Date.now() - parseTimestampMs(timestamp)) / 1000;
    if (Math.abs(ageSeconds) > toleranceSeconds) {
      throw new TimestampToleranceError(timestamp, toleranceSeconds, ageSeconds);
    }
  }

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  try {
    return JSON.parse(body) as WebhookEvent;
  } catch {
    throw new SignatureVerificationError('Webhook body is not valid JSON');
  }
}

/** Standalone webhook helpers; also available as `client.webhooks`. */
export const webhooks = {
  verifySignature,
  computeSignature,
};
