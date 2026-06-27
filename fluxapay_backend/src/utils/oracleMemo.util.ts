/**
 * Stellar memo parsing and payment attribution helpers for the payment oracle.
 */

export type StellarMemoType = "none" | "text" | "id" | "hash" | "return";

export interface StellarMemo {
  type: StellarMemoType;
  value?: string | number;
}

export type MemoMatchMode = "required" | "secondary" | "none";

export interface MemoMatchResult {
  matched: boolean;
  rejected: boolean;
  expected: string;
  received: string | null;
}

export interface HorizonTransactionMemo {
  memo_type?: string;
  memo?: string;
}

const VALID_MEMO_TYPES = new Set<StellarMemoType>([
  "none",
  "text",
  "id",
  "hash",
  "return",
]);

export function parseHorizonMemo(tx: HorizonTransactionMemo): StellarMemo {
  const rawType = (tx.memo_type || "none") as StellarMemoType;
  const type = VALID_MEMO_TYPES.has(rawType) ? rawType : "none";

  if (type === "none") {
    return { type: "none" };
  }

  if (tx.memo === undefined || tx.memo === "") {
    return { type };
  }

  if (type === "id") {
    const parsed = Number.parseInt(tx.memo, 10);
    return { type, value: Number.isNaN(parsed) ? tx.memo : parsed };
  }

  return { type, value: tx.memo };
}

export function memoValueAsString(memo: StellarMemo): string | null {
  if (memo.type === "none") {
    return null;
  }
  if (memo.value === undefined || memo.value === null) {
    return null;
  }
  return String(memo.value);
}

export function isSharedDepositAddress(
  paymentAddress: string,
  sharedDepositAddress: string | undefined,
  addressPoolEnabled: boolean,
): boolean {
  if (addressPoolEnabled) {
    return false;
  }
  return Boolean(sharedDepositAddress && paymentAddress === sharedDepositAddress);
}

export function resolveMemoMatchMode(
  paymentAddress: string,
  options: {
    sharedDepositAddress?: string;
    addressPoolEnabled: boolean;
  },
): MemoMatchMode {
  if (options.addressPoolEnabled) {
    return "secondary";
  }
  if (isSharedDepositAddress(paymentAddress, options.sharedDepositAddress, false)) {
    return "required";
  }
  return "none";
}

export function validateMemoMatch(
  expectedPaymentId: string,
  memo: StellarMemo,
  mode: MemoMatchMode,
): MemoMatchResult {
  const received = memoValueAsString(memo);
  const base = { expected: expectedPaymentId, received };

  if (mode === "none") {
    return { ...base, matched: true, rejected: false };
  }

  if (mode === "required") {
    if (!received) {
      return { ...base, matched: false, rejected: true };
    }
    const matched = received === expectedPaymentId;
    return { ...base, matched, rejected: !matched };
  }

  // secondary verification — warn on mismatch but do not reject attribution
  if (!received) {
    return { ...base, matched: true, rejected: false };
  }
  const matched = received === expectedPaymentId;
  return { ...base, matched, rejected: false };
}
