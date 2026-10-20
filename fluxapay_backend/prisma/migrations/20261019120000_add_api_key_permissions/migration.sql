ALTER TABLE "ApiKey"
ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[
	'payments:read', 'payments:write', 'refunds:read', 'refunds:write',
	'customers:read', 'customers:write', 'invoices:read', 'invoices:write',
	'payment_links:read', 'payment_links:write', 'settlements:read', 'settlements:write',
	'webhooks:manage', 'api_keys:manage', 'account:read', 'account:manage', 'data_exports:manage'
]::TEXT[],
ADD COLUMN "ip_allowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ApiKey"
ALTER COLUMN "permissions" SET DEFAULT ARRAY['payments:read']::TEXT[];