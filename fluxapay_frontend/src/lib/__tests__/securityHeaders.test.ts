import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applySecurityHeaders,
  createContentSecurityPolicy,
  createCspNonce,
  STATIC_SECURITY_HEADERS,
} from "../securityHeaders";

describe("security response headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a unique per-request nonce", () => {
    const firstNonce = createCspNonce();
    const secondNonce = createCspNonce();

    expect(firstNonce).toMatch(/^[a-f0-9]{32}$/);
    expect(secondNonce).not.toBe(firstNonce);
  });

  it("uses the nonce for scripts and style elements and whitelists required origins", () => {
    const policy = createContentSecurityPolicy("test-nonce");

    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' https://albedo.link");
    expect(policy).toContain("style-src 'self' 'nonce-test-nonce'");
    expect(policy).toContain("style-src-elem 'self' 'nonce-test-nonce'");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(policy).toContain("https://horizon.stellar.org");
    expect(policy).toContain("https://horizon-testnet.stellar.org");
    expect(policy).toContain("https://*.ingest.sentry.io");
    expect(policy).toContain("frame-ancestors 'self'");
  });

  it("accepts only explicit HTTPS frame ancestors (and localhost for development)", () => {
    vi.stubEnv(
      "CSP_FRAME_ANCESTORS",
      "https://merchant.example http://localhost:3000 https://*.attacker.example javascript:alert(1) https://invalid.example/path",
    );

    const policy = createContentSecurityPolicy("test-nonce");

    expect(policy).toContain("frame-ancestors 'self' https://merchant.example http://localhost:3000");
    expect(policy).not.toContain("*.attacker.example");
    expect(policy).not.toContain("javascript:");
    expect(policy).not.toContain("https://invalid.example/path");
  });

  it("sets CSP and every required security response header", () => {
    const response = new Response();

    applySecurityHeaders(response, "test-nonce");

    expect(response.headers.get("Content-Security-Policy")).toContain("nonce-test-nonce");
    for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});