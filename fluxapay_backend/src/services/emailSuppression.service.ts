import { PrismaClient } from "../generated/client/client";
import { getLogger } from "../utils/logger";

const prisma = new PrismaClient();
const logger = getLogger("EmailSuppressionService");

export type SuppressionReason = "bounce" | "complaint" | "unsubscribe";

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const record = await prisma.emailSuppression.findUnique({
    where: { email: normalized },
  });
  return Boolean(record);
}

export async function addEmailSuppression(
  email: string,
  reason: SuppressionReason,
  source?: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await prisma.emailSuppression.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      reason,
      source,
    },
    update: {
      reason,
      source,
    },
  });
  logger.info("Email added to suppression list", { email: normalized, reason, source });
}

export async function ingestBounceEvents(payload: unknown): Promise<number> {
  const emails = extractSuppressionEmails(payload);
  let ingested = 0;

  for (const entry of emails) {
    await addEmailSuppression(entry.email, entry.reason, entry.source);
    ingested += 1;
  }

  return ingested;
}

function extractSuppressionEmails(
  payload: unknown,
): Array<{ email: string; reason: SuppressionReason; source?: string }> {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.flatMap((item) => extractSuppressionEmails(item));
  }

  if (typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const results: Array<{ email: string; reason: SuppressionReason; source?: string }> = [];

  const type = String(record.type ?? record.event ?? record.record_type ?? "").toLowerCase();
  const reason = mapEventToReason(type);

  if (reason) {
    const emails = collectEmailAddresses(record);
    for (const email of emails) {
      results.push({ email, reason, source: type || undefined });
    }
  }

  if (Array.isArray(record.events)) {
    results.push(...extractSuppressionEmails(record.events));
  }

  return results;
}

function mapEventToReason(eventType: string): SuppressionReason | null {
  if (
    eventType.includes("bounce") ||
    eventType.includes("bounced") ||
    eventType.includes("hard_bounce") ||
    eventType.includes("soft_bounce")
  ) {
    return "bounce";
  }
  if (
    eventType.includes("complaint") ||
    eventType.includes("spam") ||
    eventType.includes("unsubscribe")
  ) {
    return eventType.includes("unsubscribe") ? "unsubscribe" : "complaint";
  }
  return null;
}

function collectEmailAddresses(record: Record<string, unknown>): string[] {
  const emails: string[] = [];

  if (typeof record.email === "string") {
    emails.push(record.email);
  }

  const data = record.data;
  if (data && typeof data === "object") {
    const dataRecord = data as Record<string, unknown>;
    if (typeof dataRecord.email === "string") {
      emails.push(dataRecord.email);
    }
    if (Array.isArray(dataRecord.to)) {
      for (const to of dataRecord.to) {
        if (typeof to === "string") {
          emails.push(to);
        }
      }
    }
  }

  if (Array.isArray(record.to)) {
    for (const to of record.to) {
      if (typeof to === "string") {
        emails.push(to);
      }
    }
  }

  return emails;
}
