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

    it("parses id memo as number", () => {
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
