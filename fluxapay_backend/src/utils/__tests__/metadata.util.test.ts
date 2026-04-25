import {
  validateAndSanitizeMetadata,
  MetadataValidationError,
} from "../metadata.util";

describe("metadata util", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

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

  it("throws when metadata exceeds configured max bytes", () => {
    process.env.PAYMENT_METADATA_MAX_BYTES = "8";

    expect(() =>
      validateAndSanitizeMetadata({ note: "this is too big" }),
    ).toThrow(MetadataValidationError);
  });

  it("throws when metadata exceeds configured max depth", () => {
    process.env.PAYMENT_METADATA_MAX_DEPTH = "2";

    expect(() =>
      validateAndSanitizeMetadata({ level1: { level2: { level3: "deep" } } }),
    ).toThrow("Metadata depth exceeds maximum of 2");
  });
});
