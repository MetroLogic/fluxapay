export const API_KEY_PERMISSIONS = [
  "payments:read",
  "payments:write",
  "refunds:read",
  "refunds:write",
  "customers:read",
  "customers:write",
  "invoices:read",
  "invoices:write",
  "payment_links:read",
  "payment_links:write",
  "settlements:read",
  "settlements:write",
  "webhooks:manage",
  "api_keys:manage",
  "account:read",
  "account:manage",
  "data_exports:manage",
] as const;

export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

export const READ_ONLY_API_KEY_PERMISSIONS: readonly ApiKeyPermission[] = [
  "payments:read",
  "refunds:read",
  "customers:read",
  "invoices:read",
  "payment_links:read",
  "settlements:read",
  "account:read",
];

export function normalizeApiKeyPermissions(value: unknown): ApiKeyPermission[] {
  const permissions = value === undefined ? READ_ONLY_API_KEY_PERMISSIONS : value;
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new Error("Select at least one API key permission");
  }

  const normalized = [...new Set(permissions)];
  if (normalized.some((permission) => !API_KEY_PERMISSIONS.includes(permission))) {
    throw new Error("One or more API key permissions are invalid");
  }
  return normalized as ApiKeyPermission[];
}

export function requiredApiKeyPermission(method: string, rawPath: string): ApiKeyPermission {
  const path = rawPath.split("?")[0].toLowerCase();
  const readOnly = ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  const operation = readOnly ? "read" : "write";

  if (/^\/api\/v1\/(payments|charges)(\/|$)/.test(path)) return `payments:${operation}`;
  if (/^\/api\/v1\/refunds?(\/|$)/.test(path)) return `refunds:${operation}`;
  if (/^\/api\/v1\/customers?(\/|$)/.test(path)) return `customers:${operation}`;
  if (/^\/api\/v1\/invoices?(\/|$)/.test(path)) return `invoices:${operation}`;
  if (/^\/api\/v1\/payment-links?(\/|$)/.test(path)) return `payment_links:${operation}`;
  if (/^\/api\/v1\/(settlements?|daily-reconciliation)(\/|$)/.test(path)) {
    return `settlements:${operation}`;
  }
  if (/^\/api\/v1\/webhooks?(\/|$)/.test(path)) return "webhooks:manage";
  if (/^\/api\/v1\/(api-keys|keys)(\/|$)/.test(path)) return "api_keys:manage";
  if (/^\/api\/v1\/(data-export|merchants\/export)(\/|$)/.test(path)) {
    return "data_exports:manage";
  }
  if (/^\/api\/v1\/(merchant|merchants)(\/|$)/.test(path)) {
    return readOnly ? "account:read" : "account:manage";
  }
  if (/^\/api\/v1\/(usage|dashboard)(\/|$)/.test(path)) return "account:read";
  return "account:manage";
}