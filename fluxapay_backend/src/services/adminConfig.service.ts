import { PrismaClient } from "../generated/client/client";
import { logConfigUpdated } from "./audit.service";

const prisma = new PrismaClient();

const CONFIG_PREFIX = "admin_config:";

export const ADMIN_CONFIG_KEYS = [
  "settlement_fee_percent",
  "default_payment_expiry_minutes",
  "webhook_max_retries",
  "reconciliation_alert_threshold_percent",
] as const;

export type AdminConfigKey = (typeof ADMIN_CONFIG_KEYS)[number];

const DEFAULTS: Record<AdminConfigKey, string> = {
  settlement_fee_percent: "2.0",
  default_payment_expiry_minutes: "60",
  webhook_max_retries: "5",
  reconciliation_alert_threshold_percent: "1.0",
};

const SENSITIVE_KEYS = new Set<string>();

function configKey(key: AdminConfigKey): string {
  return `${CONFIG_PREFIX}${key}`;
}

export async function getAdminConfig(): Promise<Record<AdminConfigKey, string>> {
  const rows = await prisma.workerState.findMany({
    where: {
      key: { startsWith: CONFIG_PREFIX },
    },
  });

  const stored = Object.fromEntries(
    rows.map((row) => [row.key.replace(CONFIG_PREFIX, ""), row.value]),
  ) as Partial<Record<AdminConfigKey, string>>;

  return { ...DEFAULTS, ...stored };
}

export async function updateAdminConfig(
  adminId: string,
  updates: Partial<Record<AdminConfigKey, string>>,
): Promise<Record<AdminConfigKey, string>> {
  const current = await getAdminConfig();
  const changedFields: AdminConfigKey[] = [];
  const oldValues: Record<string, string> = {};
  const newValues: Record<string, string> = {};

  for (const [key, value] of Object.entries(updates) as [AdminConfigKey, string][]) {
    if (!(ADMIN_CONFIG_KEYS as readonly string[]).includes(key)) continue;
    if (current[key] === value) continue;

    changedFields.push(key);
    oldValues[key] = current[key];
    newValues[key] = value;

    await prisma.workerState.upsert({
      where: { key: configKey(key) },
      create: { key: configKey(key), value },
      update: { value },
    });
  }

  if (changedFields.length > 0) {
    await logConfigUpdated({
      adminId,
      changedFields,
      oldValues,
      newValues,
      sensitiveFields: [...SENSITIVE_KEYS],
    });
  }

  return getAdminConfig();
}
