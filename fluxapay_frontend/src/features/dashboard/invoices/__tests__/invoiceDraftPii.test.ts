import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveDraft,
  stripPiiFromDraft,
  type DraftState,
} from "@/features/dashboard/invoices/InvoiceForm";

const DRAFT_KEY = "invoice_form_draft";

function draft(overrides: Partial<DraftState> = {}): DraftState {
  return {
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "USD",
    dueDate: "2026-12-31",
    notes: "Thanks for your business",
    lineItems: [{ description: "Consulting", quantity: 2, unit_price: 150 }],
    ...overrides,
  } as DraftState;
}

describe("invoice draft PII exclusion", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("stripPiiFromDraft", () => {
    it("removes customer name and email", () => {
      const stripped = stripPiiFromDraft(draft()) as Record<string, unknown>;

      expect(stripped).not.toHaveProperty("customerName");
      expect(stripped).not.toHaveProperty("customerEmail");
    });

    it("keeps every non-PII field", () => {
      const stripped = stripPiiFromDraft(draft());

      expect(stripped.currency).toBe("USD");
      expect(stripped.dueDate).toBe("2026-12-31");
      expect(stripped.notes).toBe("Thanks for your business");
      expect(stripped.lineItems).toHaveLength(1);
    });

    it("does not mutate the input", () => {
      const original = draft();
      stripPiiFromDraft(original);

      expect(original.customerEmail).toBe("ada@example.com");
      expect(original.customerName).toBe("Ada Lovelace");
    });
  });

  describe("saveDraft", () => {
    it("writes no PII to localStorage", () => {
      saveDraft(draft());

      const raw = localStorage.getItem(DRAFT_KEY) ?? "";
      const stored = JSON.parse(raw) as Record<string, unknown>;

      expect(stored).not.toHaveProperty("customerName");
      expect(stored).not.toHaveProperty("customerEmail");
    });

    it("leaves no trace of the PII values anywhere in the serialised draft", () => {
      saveDraft(draft());

      // Guards against a rename or a nested copy reintroducing the value under
      // a different key — the string itself must not be in storage.
      const raw = localStorage.getItem(DRAFT_KEY) ?? "";
      expect(raw).not.toContain("ada@example.com");
      expect(raw).not.toContain("Ada Lovelace");
    });

    it("still persists the invoice fields the autosave exists for", () => {
      saveDraft(draft());

      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "") as DraftState;
      expect(stored.currency).toBe("USD");
      expect(stored.dueDate).toBe("2026-12-31");
      expect(stored.notes).toBe("Thanks for your business");
      expect(stored.lineItems[0].description).toBe("Consulting");
    });

    it("purges PII left behind by an older build on the next save", () => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          customerName: "Legacy Name",
          customerEmail: "legacy@example.com",
          currency: "EUR",
          dueDate: "",
          notes: "",
          lineItems: [],
        }),
      );

      saveDraft(draft({ currency: "GBP" }));

      const raw = localStorage.getItem(DRAFT_KEY) ?? "";
      expect(raw).not.toContain("legacy@example.com");
      expect(raw).not.toContain("Legacy Name");
    });

    it("survives a storage quota failure without throwing", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      expect(() => saveDraft(draft())).not.toThrow();

      spy.mockRestore();
    });
  });
});
