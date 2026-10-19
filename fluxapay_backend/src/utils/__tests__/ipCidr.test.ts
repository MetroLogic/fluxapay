import { describe, expect, it } from "@jest/globals";
import { isIpAllowed, isValidCidr } from "../ipCidr";

describe("API key IP allowlists", () => {
  it("validates IPv4 and IPv6 CIDR notation", () => {
    expect(isValidCidr("192.168.1.0/24")).toBe(true);
    expect(isValidCidr("2001:db8::/32")).toBe(true);
    expect(isValidCidr("192.168.1.5")).toBe(true);
    expect(isValidCidr("192.168.1.0/33")).toBe(false);
    expect(isValidCidr("2001:db8::/129")).toBe(false);
    expect(isValidCidr("not-an-ip/24")).toBe(false);
  });

  it("matches addresses against IPv4 and IPv6 ranges", () => {
    expect(isIpAllowed("192.168.1.25", ["192.168.1.0/24"])).toBe(true);
    expect(isIpAllowed("192.168.2.25", ["192.168.1.0/24"])).toBe(false);
    expect(isIpAllowed("2001:db8::5", ["2001:db8::/32"])).toBe(true);
    expect(isIpAllowed("2001:dead::5", ["2001:db8::/32"])).toBe(false);
    expect(isIpAllowed("::ffff:192.168.1.25", ["192.168.1.0/24"])).toBe(true);
    expect(isIpAllowed("192.168.1.25", ["::ffff:192.168.1.0/120"])).toBe(true);
    expect(isIpAllowed(undefined, ["192.168.1.0/24"])).toBe(false);
    expect(isIpAllowed(undefined, [])).toBe(true);
  });
});