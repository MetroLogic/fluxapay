/**
 * Deposit verification rules (#1258): genuine-USDC checks, MEMO_TEXT and
 * MEMO_ID matching, underpayment, and the unallocated-deposit queue.
 */

jest.mock("../../utils/logger", () => ({
  getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  getMetricsCollector: () => ({ increment: jest.fn() }),
}));

const mockUpsert = jest.fn();
jest.mock("../../config/prisma", () => ({
  prisma: { unallocatedDeposit: { upsert: (...a: unknown[]) => mockUpsert(...a) } },
}));
jest.mock("../../helpers/apiError.helper", () => ({
  apiError: (status: number, code: string, message: string) => ({ status, code, message }),
}));

import { Decimal } from "@prisma/client/runtime/library";
import {
  DEFAULT_USDC_ISSUER,
  authorizedUsdcIssuers,
  checkDepositAsset,
  depositMemoId,
  expectedDepositMemos,
  isUnderpaid,
  matchDepositMemo,
  type HorizonPaymentOperation,
} from "../../utils/depositVerification.util";
import { parseHorizonMemo } from "../../utils/oracleMemo.util";
import { recordUnallocatedDeposit } from "../../services/unallocatedDeposit.service";

const DEST = "GDEPOSITADDRESS";
const PAYMENT_ID = "6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41";

function op(overrides: Partial<HorizonPaymentOperation> = {}): HorizonPaymentOperation {
  return {
    id: "op_1",
    paging_token: "op_1",
    type: "payment",
    transaction_hash: "tx_1",
    asset_type: "credit_alphanum4",
    asset_code: "USDC",
    asset_issuer: DEFAULT_USDC_ISSUER,
    amount: "25.0000000",
    from: "GPAYER",
    to: DEST,
    ...overrides,
  };
}

describe("checkDepositAsset", () => {
  const issuers = [DEFAULT_USDC_ISSUER];

  it("accepts genuine USDC from the authorized issuer", () => {
    expect(checkDepositAsset(op(), DEST, issuers)).toEqual({ ok: true });
    expect(checkDepositAsset(op({ type: "path_payment_strict_receive" }), DEST, issuers)).toEqual({ ok: true });
  });

  it("rejects spoofed USDC: wrong issuer, wrong case, or a long-code asset", () => {
    for (const spoof of [
      op({ asset_issuer: "GFAKEISSUER" }),
      op({ asset_issuer: undefined }),
      op({ asset_code: "usdc" }),
      op({ asset_type: "credit_alphanum12" }),
    ]) {
      expect(checkDepositAsset(spoof, DEST, issuers)).toEqual({ ok: false, reason: "spoofed_asset" });
    }
  });

  it("flags other credit assets as unsupported", () => {
    expect(checkDepositAsset(op({ asset_code: "EURC" }), DEST, issuers)).toEqual({
      ok: false,
      reason: "unsupported_asset",
    });
  });

  it("ignores native XLM, outgoing payments and non-payment operations", () => {
    expect(checkDepositAsset(op({ asset_type: "native", asset_code: undefined }), DEST, issuers).ok).toBe(false);
    expect(checkDepositAsset(op({ to: "GSOMEONEELSE" }), DEST, issuers)).toEqual({ ok: false, reason: "not_a_deposit" });
    expect(checkDepositAsset(op({ type: "create_account" }), DEST, issuers)).toEqual({ ok: false, reason: "not_a_deposit" });
  });

  it("supports extra issuers via USDC_ALLOWED_ISSUERS", () => {
    const list = authorizedUsdcIssuers({
      USDC_ISSUER_PUBLIC_KEY: "GPRIMARY",
      USDC_ALLOWED_ISSUERS: "GSECOND, GPRIMARY ,",
    } as NodeJS.ProcessEnv);
    expect(list).toEqual(["GPRIMARY", "GSECOND"]);
    expect(checkDepositAsset(op({ asset_issuer: "GSECOND" }), DEST, list)).toEqual({ ok: true });
  });
});

describe("memo matching", () => {
  const expected = expectedDepositMemos({ id: PAYMENT_ID });

  it("derives a stable uint64-safe MEMO_ID per payment", () => {
    const id = depositMemoId(PAYMENT_ID);
    expect(id).toBe(depositMemoId(PAYMENT_ID));
    expect(id).not.toBe(depositMemoId("another-payment"));
    expect(/^\d+$/.test(id)).toBe(true);
    expect(Number.isSafeInteger(Number(id))).toBe(true);
  });

  it("keeps MEMO_IDs above 2^53 exact when parsing", () => {
    const big = "18446744073709551615";
    const memo = parseHorizonMemo({ memo_type: "id", memo: big });
    expect(memo.value).toBe(big);
    const custom = expectedDepositMemos({ id: PAYMENT_ID, metadata: { memo: big, memo_type: "id" } });
    expect(matchDepositMemo(memo, custom)).toBe("matched");
  });

  it("matches MEMO_ID", () => {
    const memo = parseHorizonMemo({ memo_type: "id", memo: depositMemoId(PAYMENT_ID) });
    expect(matchDepositMemo(memo, expected)).toBe("matched");
    expect(matchDepositMemo(parseHorizonMemo({ memo_type: "id", memo: "12345" }), expected)).toBe("mismatch");
  });

  it("matches MEMO_TEXT by payment id (case-insensitive) or the memo id as text", () => {
    expect(matchDepositMemo(parseHorizonMemo({ memo_type: "text", memo: PAYMENT_ID.toUpperCase() }), expected)).toBe("matched");
    expect(matchDepositMemo({ type: "text", value: depositMemoId(PAYMENT_ID) }, expected)).toBe("matched");
    expect(matchDepositMemo({ type: "text", value: "order-999" }, expected)).toBe("mismatch");
  });

  it("matches a merchant-supplied memo from payment metadata", () => {
    const withText = expectedDepositMemos({ id: PAYMENT_ID, metadata: { memo: "INV-42", memo_type: "MEMO_TEXT" } });
    expect(matchDepositMemo({ type: "text", value: "inv-42" }, withText)).toBe("matched");
    const withId = expectedDepositMemos({ id: PAYMENT_ID, metadata: { memo: "000777", memo_type: "id" } });
    expect(matchDepositMemo({ type: "id", value: 777 }, withId)).toBe("matched");
  });

  it("reports missing memos and never matches hash/return memos", () => {
    expect(matchDepositMemo({ type: "none" }, expected)).toBe("missing");
    expect(matchDepositMemo({ type: "text", value: "" }, expected)).toBe("missing");
    expect(matchDepositMemo({ type: "hash", value: PAYMENT_ID }, expected)).toBe("mismatch");
  });
});

describe("isUnderpaid", () => {
  it("is true only for a positive amount below the expected total", () => {
    expect(isUnderpaid(new Decimal(10), new Decimal(25))).toBe(true);
    expect(isUnderpaid(new Decimal(25), new Decimal(25))).toBe(false);
    expect(isUnderpaid(new Decimal(30), new Decimal(25))).toBe(false);
    expect(isUnderpaid(new Decimal(0), new Decimal(25))).toBe(false);
  });
});

describe("recordUnallocatedDeposit", () => {
  beforeEach(() => mockUpsert.mockReset());

  it("upserts a review record keyed by operation and reason", async () => {
    mockUpsert.mockResolvedValue({});
    const spoof = op({ asset_issuer: "GFAKEISSUER" });

    await expect(
      recordUnallocatedDeposit({ operation: spoof, destination: DEST, reason: "spoofed_asset" }),
    ).resolves.toBe(true);

    const args = mockUpsert.mock.calls[0][0];
    expect(args.where).toEqual({ operation_id_reason: { operation_id: "op_1", reason: "spoofed_asset" } });
    expect(args.create).toMatchObject({
      transaction_hash: "tx_1",
      destination_address: DEST,
      asset_code: "USDC",
      asset_issuer: "GFAKEISSUER",
      reason: "spoofed_asset",
    });
    expect(args.create.amount.toString()).toBe("25");
    expect(args.update).toEqual({});
  });

  it("stores the memo for missing/invalid memo deposits", async () => {
    mockUpsert.mockResolvedValue({});
    await recordUnallocatedDeposit({
      operation: op(),
      destination: DEST,
      reason: "invalid_memo",
      memo: { type: "text", value: "wrong" },
    });
    expect(mockUpsert.mock.calls[0][0].create).toMatchObject({ memo_type: "text", memo: "wrong" });
  });

  it("never throws when the database write fails", async () => {
    mockUpsert.mockRejectedValue(new Error("db down"));
    await expect(
      recordUnallocatedDeposit({ operation: op(), destination: DEST, reason: "underpaid" }),
    ).resolves.toBe(false);
  });

  it("skips operations without an id or transaction hash", async () => {
    await expect(
      recordUnallocatedDeposit({
        operation: op({ id: undefined, paging_token: undefined }),
        destination: DEST,
        reason: "missing_memo",
      }),
    ).resolves.toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
