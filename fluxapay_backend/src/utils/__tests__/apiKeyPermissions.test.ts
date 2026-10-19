import { describe, expect, it } from "@jest/globals";
import {
  API_KEY_PERMISSIONS,
  normalizeApiKeyPermissions,
  READ_ONLY_API_KEY_PERMISSIONS,
  requiredApiKeyPermission,
} from "../apiKeyPermissions";

describe("API key permissions", () => {
  it("defaults new keys to read-only and rejects invalid or empty selections", () => {
    expect(normalizeApiKeyPermissions(undefined)).toEqual(READ_ONLY_API_KEY_PERMISSIONS);
    expect(() => normalizeApiKeyPermissions([])).toThrow("Select at least one");
    expect(() => normalizeApiKeyPermissions(["superuser"])).toThrow("permissions are invalid");
    expect(normalizeApiKeyPermissions(["payments:read", "payments:read"])).toEqual([
      "payments:read",
    ]);
  });

  it("maps payment, refund, webhook, and key-management requests to scopes", () => {
    expect(requiredApiKeyPermission("GET", "/api/v1/payments?limit=20")).toBe("payments:read");
    expect(requiredApiKeyPermission("POST", "/api/v1/payments")).toBe("payments:write");
    expect(requiredApiKeyPermission("POST", "/api/v1/refunds")).toBe("refunds:write");
    expect(requiredApiKeyPermission("GET", "/api/v1/webhooks/logs")).toBe("webhooks:manage");
    expect(requiredApiKeyPermission("DELETE", "/api/v1/api-keys/key_1")).toBe("api_keys:manage");
    expect(API_KEY_PERMISSIONS).toContain("payments:write");
  });
});