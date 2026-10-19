export type ApiKeyPermission =
  | "payments:read" | "payments:write"
  | "refunds:read" | "refunds:write"
  | "customers:read" | "customers:write"
  | "invoices:read" | "invoices:write"
  | "payment_links:read" | "payment_links:write"
  | "settlements:read" | "settlements:write"
  | "webhooks:manage" | "api_keys:manage"
  | "account:read" | "account:manage" | "data_exports:manage";

export const API_KEY_PERMISSION_OPTIONS: { value: ApiKeyPermission; label: string }[] = [
  { value: "payments:read", label: "Read payments" },
  { value: "payments:write", label: "Create and update payments" },
  { value: "refunds:read", label: "Read refunds" },
  { value: "refunds:write", label: "Create refunds" },
  { value: "customers:read", label: "Read customers" },
  { value: "customers:write", label: "Manage customers" },
  { value: "invoices:read", label: "Read invoices" },
  { value: "invoices:write", label: "Manage invoices" },
  { value: "payment_links:read", label: "Read payment links" },
  { value: "payment_links:write", label: "Manage payment links" },
  { value: "settlements:read", label: "Read settlements" },
  { value: "settlements:write", label: "Manage settlements" },
  { value: "webhooks:manage", label: "Manage webhooks" },
  { value: "api_keys:manage", label: "Manage API keys" },
  { value: "account:read", label: "Read account settings" },
  { value: "account:manage", label: "Manage account settings" },
  { value: "data_exports:manage", label: "Create data exports" },
];

export const READ_ONLY_API_KEY_PERMISSIONS: ApiKeyPermission[] = [
  "payments:read",
  "refunds:read",
  "customers:read",
  "invoices:read",
  "payment_links:read",
  "settlements:read",
  "account:read",
];

export const FULL_ACCESS_API_KEY_PERMISSIONS = API_KEY_PERMISSION_OPTIONS.map(
  (option) => option.value,
);