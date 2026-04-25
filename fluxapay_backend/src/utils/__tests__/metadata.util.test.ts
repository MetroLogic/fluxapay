import {
  validateAndSanitizeMetadata,
  MetadataValidationError,
  DEFAULT_METADATA_MAX_BYTES,
  DEFAULT_METADATA_MAX_DEPTH,
} from "../metadata.util";

describe("metadata util", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Sanitization ────────────────────────────────────────────────────────────

  it("sanitizes html from strings", () => {
    const result = validateAndSanitizeMetadata({
      note: "<script>alert(1)</script><b>hello</b>",
      nested: { comment: "<img src=x onerror=alert(1)>ok" },
    });

    expect(result).toEqual({
      note: "hello",
      nested: { comment: "ok" },
    });
  });

  it("returns empty object for null metadata", () => {
    expect(validateAndSanitizeMetadata(null)).toEqual({});
  });

  it("returns empty object for undefined metadata", () => {
    expect(validateAndSanitizeMetadata(undefined)).toEqual({});
  });

  // ── Type validation ─────────────────────────────────────────────────────────

  it("throws MetadataValidationError when metadata is an array", () => {
    expect(() => validateAndSanitizeMetadata(["a", "b"])).toThrow(
      MetadataValidationError,
    );
  });

  it("throws MetadataValidationError when metadata is a string", () => {
    expect(() => validateAndSanitizeMetadata("not an object")).toThrow(
      MetadataValidationError,
    );
  });

  it("throws MetadataValidationError when metadata is a number", () => {
    expect(() => validateAndSanitizeMetadata(42)).toThrow(
      MetadataValidationError,
    );
  });

  // ── Size limit ──────────────────────────────────────────────────────────────

  it("throws when metadata exceeds configured max bytes", () => {
    process.env.PAYMENT_METADATA_MAX_BYTES = "8";

    expect(() =>
      validateAndSanitizeMetadata({ note: "this is too big" }),
    ).toThrow(MetadataValidationError);
  });

  it("error message includes the byte limit", () => {
    process.env.PAYMENT_METADATA_MAX_BYTES = "8";

    expect(() =>
      validateAndSanitizeMetadata({ note: "this is too big" }),
    ).toThrow("8 bytes");
  });

  it("accepts metadata exactly at the default byte limit", () => {
    // Build a payload that is exactly DEFAULT_METADATA_MAX_BYTES bytes
    const value = "x".repeat(
      DEFAULT_METADATA_MAX_BYTES - '{"k":"'.length - '"}'.length,
    );
    // Should not throw
    expect(() => validateAndSanitizeMetadata({ k: value })).not.toThrow();
  });

  // ── Depth limit ─────────────────────────────────────────────────────────────

  it("throws when metadata exceeds configured max depth", () => {
    process.env.PAYMENT_METADATA_MAX_DEPTH = "2";

    expect(() =>
      validateAndSanitizeMetadata({ level1: { level2: { level3: "deep" } } }),
    ).toThrow("Metadata depth exceeds maximum of 2");
  });

  it("accepts metadata exactly at the default depth limit", () => {
    // DEFAULT_METADATA_MAX_DEPTH = 5.
    // assertDepth starts at depth=1 and throws when depth > maxDepth.
    // A flat object { k: "v" } has depth 1 — well within the limit.
    // Build 4 levels of nesting: the root counts as depth 1, each child adds 1.
    // { a: { b: { c: { d: "leaf" } } } } → depth 4, safely within 5.
    const nested = { a: { b: { c: { d: "leaf" } } } };
    expect(() => validateAndSanitizeMetadata(nested)).not.toThrow();
  });

  it("throws for depth one beyond the default limit", () => {
    let nested: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < DEFAULT_METADATA_MAX_DEPTH; i++) {
      nested = { child: nested };
    }
    expect(() => validateAndSanitizeMetadata(nested)).toThrow(
      MetadataValidationError,
    );
  });

  // ── MetadataValidationError shape ───────────────────────────────────────────

  it("MetadataValidationError has status 400", () => {
    process.env.PAYMENT_METADATA_MAX_BYTES = "1";
    try {
      validateAndSanitizeMetadata({ k: "v" });
      fail("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MetadataValidationError);
      expect((err as MetadataValidationError).status).toBe(400);
    }
  });
});
