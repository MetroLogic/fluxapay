import {
  isValidPositiveAmount,
  assertValidPositiveAmount,
  assertValidLineItems,
  AmountValidationError,
  MAX_AMOUNT,
} from "../amount.util";

describe("amount util", () => {
  // ── isValidPositiveAmount ──────────────────────────────────────────────────

  describe("isValidPositiveAmount", () => {
    it("accepts a normal positive number", () => {
      expect(isValidPositiveAmount(100)).toBe(true);
    });

    it("accepts small positive decimals", () => {
      expect(isValidPositiveAmount(0.01)).toBe(true);
    });

    it("accepts the max allowed amount", () => {
      expect(isValidPositiveAmount(MAX_AMOUNT)).toBe(true);
    });

    it("rejects zero", () => {
      expect(isValidPositiveAmount(0)).toBe(false);
    });

    it("rejects negative numbers", () => {
      expect(isValidPositiveAmount(-50)).toBe(false);
    });

    it("rejects NaN", () => {
      expect(isValidPositiveAmount(NaN)).toBe(false);
    });

    it("rejects Infinity", () => {
      expect(isValidPositiveAmount(Infinity)).toBe(false);
    });

    it("rejects values above MAX_AMOUNT", () => {
      expect(isValidPositiveAmount(MAX_AMOUNT + 1)).toBe(false);
    });

    it("rejects strings", () => {
      expect(isValidPositiveAmount("100")).toBe(false);
    });

    it("rejects null and undefined", () => {
      expect(isValidPositiveAmount(null)).toBe(false);
      expect(isValidPositiveAmount(undefined)).toBe(false);
    });
  });

  // ── assertValidPositiveAmount ──────────────────────────────────────────────

  describe("assertValidPositiveAmount", () => {
    it("does not throw for a valid positive amount", () => {
      expect(() => assertValidPositiveAmount(25.5, "amount")).not.toThrow();
    });

    it("throws AmountValidationError for zero", () => {
      expect(() => assertValidPositiveAmount(0, "amount")).toThrow(
        AmountValidationError,
      );
    });

    it("throws with a message identifying the field for negative values", () => {
      expect(() => assertValidPositiveAmount(-10, "amount")).toThrow(
        "amount must be greater than 0",
      );
    });

    it("throws for non-numeric values", () => {
      expect(() => assertValidPositiveAmount("50" as unknown, "amount")).toThrow(
        "amount must be a valid number",
      );
    });

    it("throws for values exceeding MAX_AMOUNT", () => {
      expect(() =>
        assertValidPositiveAmount(MAX_AMOUNT + 1, "amount"),
      ).toThrow(/exceeds the maximum allowed value/);
    });
  });

  // ── assertValidLineItems ────────────────────────────────────────────────────

  describe("assertValidLineItems", () => {
    it("does not throw for valid line items", () => {
      expect(() =>
        assertValidLineItems([
          { quantity: 2, unit_price: 10 },
          { quantity: 1, unit_price: 5.99 },
        ]),
      ).not.toThrow();
    });

    it("does nothing when line items are undefined", () => {
      expect(() => assertValidLineItems(undefined)).not.toThrow();
    });

    it("throws when a quantity is zero or negative", () => {
      expect(() =>
        assertValidLineItems([{ quantity: 0, unit_price: 10 }]),
      ).toThrow("line_items[0].quantity must be greater than 0");
    });

    it("throws when a unit_price is negative", () => {
      expect(() =>
        assertValidLineItems([{ quantity: 1, unit_price: -5 }]),
      ).toThrow("line_items[0].unit_price must be greater than 0");
    });

    it("identifies the correct index among multiple items", () => {
      expect(() =>
        assertValidLineItems([
          { quantity: 1, unit_price: 10 },
          { quantity: -2, unit_price: 5 },
        ]),
      ).toThrow("line_items[1].quantity must be greater than 0");
    });
  });
});
