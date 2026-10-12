import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT, safeRedirectPath } from "@/lib/safeRedirect";

const ORIGIN = "https://app.fluxapay.test";

describe("safeRedirectPath", () => {
  describe("accepts same-origin paths", () => {
    it.each([
      ["/dashboard", "/dashboard"],
      ["/dashboard/settings", "/dashboard/settings"],
      ["/en/dashboard/invoices", "/en/dashboard/invoices"],
      ["/dashboard/refunds?page=2", "/dashboard/refunds?page=2"],
      ["/dashboard/payments#row-3", "/dashboard/payments#row-3"],
      ["  /dashboard  ", "/dashboard"],
    ])("keeps %s", (input, expected) => {
      expect(safeRedirectPath(input, ORIGIN)).toBe(expected);
    });

    it("normalises traversal back to a same-origin path", () => {
      expect(safeRedirectPath("/dashboard/../settings", ORIGIN)).toBe("/settings");
    });
  });

  describe("rejects off-origin targets", () => {
    it.each([
      ["absolute http", "http://evil.com"],
      ["absolute https", "https://evil.com"],
      ["protocol-relative", "//evil.com"],
      ["protocol-relative with path", "//evil.com/steal"],
      ["backslash authority", "/\\evil.com"],
      ["mixed slash authority", "/\\/evil.com"],
      ["backslash anywhere", "/dashboard\\..\\evil"],
      ["javascript scheme", "javascript:alert(1)"],
      ["data scheme", "data:text/html,<script>alert(1)</script>"],
      ["vbscript scheme", "vbscript:msgbox(1)"],
      ["javascript scheme, upper-case", "JAVASCRIPT:alert(1)"],
      ["javascript scheme, mixed-case", "JavaScript:alert(1)"],
      ["data scheme, upper-case", "DATA:text/html,<script>alert(1)</script>"],
      ["javascript scheme with leading whitespace", "  javascript:alert(1)"],
      ["scheme without leading slash", "evil.com"],
      ["tab-smuggled authority", "/\t/evil.com"],
      ["newline-smuggled authority", "/\n//evil.com"],
      ["null byte", "/dashboard\u0000"],
    ])("rejects %s", (_label, input) => {
      expect(safeRedirectPath(input, ORIGIN)).toBe(DEFAULT_REDIRECT);
    });
  });

  describe("falls back for empty input", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["empty string", ""],
      ["whitespace only", "   "],
    ])("defaults on %s", (_label, input) => {
      expect(safeRedirectPath(input, ORIGIN)).toBe(DEFAULT_REDIRECT);
    });
  });

  it("defaults when no origin is resolvable", () => {
    expect(safeRedirectPath("/dashboard", "")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("/dashboard", "not-a-url")).toBe(DEFAULT_REDIRECT);
  });

  it("treats a same-origin-looking path with a scheme in it as a path", () => {
    // Not a redirect off-origin: it resolves under our own host.
    expect(safeRedirectPath("/https://evil.com", ORIGIN)).toBe("/https://evil.com");
  });

  it("treats a leading-slash-prefixed dangerous scheme as a harmless literal path", () => {
    // A leading "/" makes this an unambiguous same-origin path reference in
    // every standards-compliant URL parser/browser — it can never be
    // interpreted as a `javascript:` navigation, unlike the bare
    // `javascript:alert(1)` (no leading slash) rejected above.
    expect(safeRedirectPath("/javascript:alert(1)", ORIGIN)).toBe("/javascript:alert(1)");
  });
});
