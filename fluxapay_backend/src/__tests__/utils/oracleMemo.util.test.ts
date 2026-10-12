import {
  parseHorizonMemo,
  resolveMemoMatchMode,
  validateMemoMatch,
  memoValueAsString,
  isSharedDepositAddress,
} from "../../utils/oracleMemo.util";

describe("oracleMemo.util", () => {
  describe("parseHorizonMemo", () => {
    it("parses text memo type and value", () => {
      const memo = parseHorizonMemo({ memo_type: "text", memo: "pay-123" });
      expect(memo).toEqual({ type: "text", value: "pay-123" });
    });

    it("normalises uppercase text memo to lowercase", () => {
      const memo = parseHorizonMemo({ memo_type: "text", memo: "CHARGE_ABC123" });
      expect(memo).toEqual({ type: "text", value: "charge_abc123" });
    });

    it("normalises mixed-case text memo to lowercase", () => {
      const memo = parseHorizonMemo({ memo_type: "text", memo: "Pay_AbC_456" });
      expect(memo).toEqual({ type: "text", value: "pay_abc_456" });
    });

    it("parses id memo as number without lowercasing", () => {
      const memo = parseHorizonMemo({ memo_type: "id", memo: "42" });
      expect(memo).toEqual({ type: "id", value: 42 });
    });

    it("returns none when memo_type is none", () => {
      expect(parseHorizonMemo({ memo_type: "none" })).toEqual({ type: "none" });
    });
  });

  describe("validateMemoMatch", () => {
    it("matches memo to payment_id in required mode", () => {
      const result = validateMemoMatch(
        "pay-abc",
        { type: "text", value: "pay-abc" },
        "required",
      );
      expect(result.matched).toBe(true);
      expect(result.rejected).toBe(false);
    });

    it("matches uppercase memo to lowercase expected payment id in required mode", () => {
      const result = validateMemoMatch(
        "charge_abc123",
        { type: "text", value: "CHARGE_ABC123" },
        "required",
      );
      expect(result.matched).toBe(true);
      expect(result.rejected).toBe(false);
    });

    it("matches lowercase memo to uppercase expected payment id in required mode", () => {
      const result = validateMemoMatch(
        "CHARGE_ABC123",
        { type: "text", value: "charge_abc123" },
        "required",
      );
      expect(result.matched).toBe(true);
      expect(result.rejected).toBe(false);
    });

    it("matches mixed-case memo to mixed-case expected payment id in required mode", () => {
      const result = validateMemoMatch(
        "Charge_Abc_123",
        { type: "text", value: "CHARGE_abc_123" },
        "required",
      );
      expect(result.matched).toBe(true);
      expect(result.rejected).toBe(false);
    });

    it("rejects memo mismatch in required mode with expected and received values", () => {
      const result = validateMemoMatch(
        "pay-abc",
        { type: "text", value: "pay-wrong" },
        "required",
      );
      expect(result.matched).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.expected).toBe("pay-abc");
      expect(result.received).toBe("pay-wrong");
    });

    it("rejects missing memo in required mode", () => {
      const result = validateMemoMatch("pay-abc", { type: "none" }, "required");
      expect(result.matched).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.received).toBeNull();
    });

    it("allows dedicated address flow with no memo required", () => {
      const result = validateMemoMatch("pay-abc", { type: "none" }, "none");
      expect(result.matched).toBe(true);
      expect(result.rejected).toBe(false);
    });

    it("uses memo as secondary verification when address pool is active", () => {
      const mismatch = validateMemoMatch(
        "pay-abc",
        { type: "text", value: "other" },
        "secondary",
      );
      expect(mismatch.matched).toBe(false);
      expect(mismatch.rejected).toBe(false);

      const match = validateMemoMatch(
        "pay-abc",
        { type: "text", value: "pay-abc" },
        "secondary",
      );
      expect(match.matched).toBe(true);
      expect(match.rejected).toBe(false);

      const upperMatch = validateMemoMatch(
        "pay-abc",
        { type: "text", value: "PAY-ABC" },
        "secondary",
      );
      expect(upperMatch.matched).toBe(true);
      expect(upperMatch.rejected).toBe(false);
    });

    it("regression test: uppercase memo from real Lobstr/Horizon transaction fixture matches payment", () => {
      const horizonTxFixture = {
        id: "d8e37604be2030f04f2f0a1c68f237efb3cf68b75f8502f6bc7d667be5691c2b",
        paging_token: "1234567890",
        successful: true,
        hash: "d8e37604be2030f04f2f0a1c68f237efb3cf68b75f8502f6bc7d667be5691c2b",
        ledger: 12345,
        created_at: "2026-08-25T12:00:00Z",
        source_account: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        memo_type: "text",
        memo: "CHARGE_ABC123",
      };

      const parsedMemo = parseHorizonMemo(horizonTxFixture);
      expect(parsedMemo).toEqual({ type: "text", value: "charge_abc123" });

      const matchResult = validateMemoMatch("charge_abc123", parsedMemo, "required");
      expect(matchResult.matched).toBe(true);
      expect(matchResult.rejected).toBe(false);
    });
  });

  describe("resolveMemoMatchMode", () => {
    it("requires memo for shared deposit address", () => {
      expect(
        resolveMemoMatchMode("GSHARED", {
          sharedDepositAddress: "GSHARED",
          addressPoolEnabled: false,
        }),
      ).toBe("required");
    });

    it("uses secondary mode when address pool is active", () => {
      expect(
        resolveMemoMatchMode("GSHARED", {
          sharedDepositAddress: "GSHARED",
          addressPoolEnabled: true,
        }),
      ).toBe("secondary");
    });

    it("skips memo for dedicated addresses", () => {
      expect(
        resolveMemoMatchMode("GDEDICATED", {
          sharedDepositAddress: "GSHARED",
          addressPoolEnabled: false,
        }),
      ).toBe("none");
    });
  });

  describe("memoValueAsString", () => {
    it("stringifies id memo values", () => {
      expect(memoValueAsString({ type: "id", value: 99 })).toBe("99");
    });
  });

  describe("isSharedDepositAddress", () => {
    it("returns false when address pool is enabled", () => {
      expect(isSharedDepositAddress("GSHARED", "GSHARED", true)).toBe(false);
    });
  });
});
