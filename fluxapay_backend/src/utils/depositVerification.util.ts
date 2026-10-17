/**
 * Deposit verification rules for customer payments (issue #1258).
 *
 * Pure functions, so every rule is unit-testable without Horizon or a DB:
 *
 * - Asset: only genuine USDC counts — asset code exactly `USDC`, a
 *   `credit_alphanum4` asset, issued by an authorized issuer. A transfer that
 *   *looks* like USDC (code `USDC`/`usdc`, any other issuer) is a spoof.
 * - Memo: shared hot wallets route deposits by memo. Both MEMO_TEXT and
 *   MEMO_ID are supported. Stellar caps MEMO_TEXT at 28 bytes, which a
 *   36-character payment UUID cannot fit, so every payment also has a
 *   deterministic numeric MEMO_ID (`depositMemoId`) that customers can use.
 * - Amount: deposits below the expected amount are flagged as underpaid.
 */

import crypto from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import type { StellarMemo } from "./oracleMemo.util";

export const DEFAULT_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";

/** Horizon payment-like operation record (the fields we rely on). */
export interface HorizonPaymentOperation {
  id?: string;
  paging_token?: string;
  type?: string;
  transaction_hash?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
  from?: string;
  to?: string;
}

export type UnallocatedReason =
  | "missing_memo"
  | "invalid_memo"
  | "spoofed_asset"
  | "unsupported_asset"
  | "underpaid";

export type AssetCheck =
  | { ok: true }
  | { ok: false; reason: "spoofed_asset" | "unsupported_asset" }
  /** Not a customer deposit at all (outgoing, native XLM funding, other ops). */
  | { ok: false; reason: "not_a_deposit" };

const DEPOSIT_OPERATION_TYPES = new Set([
  "payment",
  "path_payment_strict_receive",
  "path_payment_strict_send",
]);

/**
 * Issuers whose USDC is accepted: `USDC_ISSUER_PUBLIC_KEY` plus any in
 * `USDC_ALLOWED_ISSUERS` (comma-separated), e.g. during an issuer migration.
 */
export function authorizedUsdcIssuers(env: NodeJS.ProcessEnv = process.env): string[] {
  const issuers = [env.USDC_ISSUER_PUBLIC_KEY || DEFAULT_USDC_ISSUER];
  for (const extra of (env.USDC_ALLOWED_ISSUERS || "").split(",")) {
    const issuer = extra.trim();
    if (issuer && !issuers.includes(issuer)) issuers.push(issuer);
  }
  return issuers;
}

/** Strict asset code + issuer verification for an incoming operation. */
export function checkDepositAsset(
  op: HorizonPaymentOperation,
  destination: string,
  authorizedIssuers: readonly string[],
): AssetCheck {
  if (!op.type || !DEPOSIT_OPERATION_TYPES.has(op.type) || op.to !== destination) {
    return { ok: false, reason: "not_a_deposit" };
  }
  if (op.asset_type === "native" || !op.asset_type) {
    // XLM (e.g. account funding / reserves) is never a charge payment.
    return { ok: false, reason: "not_a_deposit" };
  }

  const code = op.asset_code ?? "";
  const looksLikeUsdc = code.trim().toUpperCase() === "USDC";
  if (!looksLikeUsdc) return { ok: false, reason: "unsupported_asset" };

  const genuine =
    code === "USDC" &&
    op.asset_type === "credit_alphanum4" &&
    typeof op.asset_issuer === "string" &&
    authorizedIssuers.includes(op.asset_issuer);
  return genuine ? { ok: true } : { ok: false, reason: "spoofed_asset" };
}

/**
 * Deterministic MEMO_ID for a payment: the first 52 bits of SHA-256 of its
 * id, as a decimal string. 52 bits fits Stellar's uint64 MEMO_ID and stays
 * within JavaScript's exactly-representable integer range, so no client or
 * parser can round it.
 */
export function depositMemoId(paymentId: string): string {
  const hex = crypto.createHash("sha256").update(paymentId).digest("hex").slice(0, 13);
  return BigInt(`0x${hex}`).toString(10);
}

export interface ExpectedMemos {
  /** Accepted MEMO_TEXT values, lower-cased. */
  text: string[];
  /** Accepted MEMO_ID values, as decimal strings. */
  id: string[];
}

/**
 * Memos that identify `payment`: its id (text), its derived MEMO_ID (as id or
 * text), and a merchant-supplied memo in `metadata.memo` /
 * `metadata.memo_type` when present.
 */
export function expectedDepositMemos(payment: { id: string; metadata?: unknown }): ExpectedMemos {
  const memoId = depositMemoId(payment.id);
  const text = new Set<string>([payment.id.toLowerCase(), memoId]);
  const id = new Set<string>([memoId]);

  const meta = payment.metadata && typeof payment.metadata === "object"
    ? (payment.metadata as Record<string, unknown>)
    : {};
  const custom = meta.memo ?? meta.stellar_memo;
  const customType = String(meta.memo_type ?? meta.memoType ?? "text").toLowerCase().replace("memo_", "");
  if (typeof custom === "string" || typeof custom === "number") {
    const value = String(custom).trim();
    if (value) {
      if (customType === "id" && /^\d+$/.test(value)) id.add(value.replace(/^0+(?=\d)/, ""));
      else text.add(value.toLowerCase());
    }
  }
  return { text: [...text], id: [...id] };
}

export type MemoVerdict = "matched" | "missing" | "mismatch";

/** Match a parsed transaction memo (MEMO_TEXT or MEMO_ID) against a payment. */
export function matchDepositMemo(memo: StellarMemo, expected: ExpectedMemos): MemoVerdict {
  if (memo.type === "none" || memo.value === undefined || memo.value === null || memo.value === "") {
    return "missing";
  }
  const value = String(memo.value).trim();
  if (memo.type === "text") {
    return expected.text.includes(value.toLowerCase()) ? "matched" : "mismatch";
  }
  if (memo.type === "id") {
    const normalized = /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, "") : value;
    return expected.id.includes(normalized) ? "matched" : "mismatch";
  }
  // MEMO_HASH / MEMO_RETURN cannot identify a charge.
  return "mismatch";
}

/** True when a strictly positive total is still short of the expected amount. */
export function isUnderpaid(received: Decimal, expected: Decimal): boolean {
  return received.gt(0) && received.lt(expected);
}
