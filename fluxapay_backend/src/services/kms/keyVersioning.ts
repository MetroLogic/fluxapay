/**
 * Envelope key-version helpers.
 *
 * Versioned ciphertext format: `v<N>$<provider body>`.
 * Ciphertext without a `v<N>$` prefix is legacy and is treated as version 1.
 *
 * Config:
 *   KMS_ACTIVE_KEY_VERSION   active version used by encrypt() (default 1)
 */
export const LEGACY_KEY_VERSION = 1;
const PREFIX_RE = /^v(\d+)\$([\s\S]*)$/;

export function getActiveKeyVersion(): number {
  const v = parseInt(process.env.KMS_ACTIVE_KEY_VERSION || "", 10);
  return Number.isInteger(v) && v >= 1 ? v : LEGACY_KEY_VERSION;
}

export function wrapEnvelope(version: number, body: string): string {
  return `v${version}$${body}`;
}

export function parseEnvelope(ciphertext: string): {
  version: number;
  body: string;
  versioned: boolean;
} {
  const m = PREFIX_RE.exec(ciphertext);
  if (!m) {
    return { version: LEGACY_KEY_VERSION, body: ciphertext, versioned: false };
  }
  return { version: parseInt(m[1], 10), body: m[2], versioned: true };
}

/** True when the ciphertext was not produced under the active key version. */
export function needsReencryption(ciphertext: string): boolean {
  const { version, versioned } = parseEnvelope(ciphertext);
  return !versioned || version !== getActiveKeyVersion();
}
