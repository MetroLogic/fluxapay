import { describe, expect, it } from "vitest";
import { isValidCidrRange, parseCidrAllowlist } from "../ipCidr";

describe("CIDR allowlist input", () => {
  it("validates IPv4 and IPv6 addresses with prefixes", () => {
    expect(isValidCidrRange("192.0.2.0/24")).toBe(true);
    expect(isValidCidrRange("2001:db8::/32")).toBe(true);
    expect(isValidCidrRange("192.0.2.1/33")).toBe(false);
    expect(isValidCidrRange("example.com/24")).toBe(false);
  });

  it("parses comma and newline separated ranges and rejects invalid entries", () => {
    expect(parseCidrAllowlist("192.0.2.0/24,\n2001:db8::/32")).toEqual([
      "192.0.2.0/24",
      "2001:db8::/32",
    ]);
    expect(() => parseCidrAllowlist("not-a-cidr")).toThrow("Invalid CIDR block");
  });
});