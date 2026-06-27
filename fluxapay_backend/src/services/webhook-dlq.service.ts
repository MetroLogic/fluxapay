import { prisma } from "../config/prisma";
import { getLogger } from "../utils/logger";
import { sendAlert } from "./alerting.service";

const logger = getLogger("WebhookDLQService");

interface WebhookDLQItem {
  id: string;
  merchantId: string;
  webhookLogId: string;
  event_type: string;
  endpoint_url: string;
  failure_reason: string;
  last_http_status?: number;
  retry_count: number;
  max_retries: number;
  created_at: Date;
  expires_at: Date;
}

/**
 * Move a failed webhook to the dead-letter queue
 */
export async function moveWebhookToDLQ(params: {
  webhookLogId: string;
  merchantId: string;
  event_type: string;
  endpoint_url: string;
  failure_reason: string;
  last_http_status?: number;
  request_payload?: any;
  response_body?: string;
}): Promise<WebhookDLQItem> {
  const {
    webhookLogId,
    merchantId,
    event_type,
    endpoint_url,
    failure_reason,
    last_http_status,
    request_payload,
    response_body,
  } = params;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const dlqItem = await prisma.webhookDeadLetterQueue.create({
    data: {
      webhookLogId,
      merchantId,
      event_type,
      endpoint_url,
      failure_reason,
      last_http_status,
      request_payload,
      response_body,
      expires_at: expiresAt,
    },
  });

  logger.warn("Webhook moved to DLQ", {
    dlqItemId: dlqItem.id,
    webhookLogId,
    merchantId,
    event_type,
    endpoint_url,
  });

  // Send alert to operations team
  await alertWebhookDLQ(merchantId, event_type, endpoint_url, failure_reason);

  return dlqItem;
}

/**
 * Alert when a webhook reaches the DLQ
 */
async function alertWebhookDLQ(
  merchantId: string,
  eventType: string,
  endpointUrl: string,
  failureReason: string,
): Promise<void> {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { business_name: true, email: true },
    });

    if (!merchant) return;

    const message = `
Webhook Delivery Failed (DLQ)

Merchant: ${merchant.business_name} (${merchantId})
Event: ${eventType}
Endpoint: ${endpointUrl}
Failure: ${failureReason}

Action Required: Review and replay from admin dashboard.
    `.trim();

    await sendAlert({
      type: "webhook_dlq",
      severity: "warning",
      message,
      details: {
        merchantId,
        eventType,
        endpointUrl,
        failureReason,
      },
    });
  } catch (error) {
    logger.error("Failed to send webhook DLQ alert", {
      error: (error as Error).message,
      merchantId,
    });
  }
}

/**
 * List DLQ items for a merchant or admin
 */
export async function listWebhookDLQ(params: {
  merchantId?: string;
  page: number;
  limit: number;
}): Promise<{
  items: WebhookDLQItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const { merchantId, page = 1, limit = 20 } = params;

  const where: any = {};
  if (merchantId) {
    where.merchantId = merchantId;
  }

  const [items, total] = await Promise.all([
    prisma.webhookDeadLetterQueue.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.webhookDeadLetterQueue.count({ where }),
  ]);

  return {
    items: items as WebhookDLQItem[],
    total,
    page,
    limit,
  };
}

/**
 * Replay a webhook from the DLQ
 */
export async function replayWebhookFromDLQ(
  dlqItemId: string,
  merchantId: string,
): Promise<void> {
  const dlqItem = await prisma.webhookDeadLetterQueue.findUnique({
    where: { id: dlqItemId },
    include: { webhookLog: true },
  });

  if (!dlqItem) {
    throw new Error(`DLQ item ${dlqItemId} not found`);
  }

  if (dlqItem.merchantId !== merchantId) {
    throw new Error("Unauthorized");
  }

  const webhookLog = dlqItem.webhookLog;

  // Reset webhook status for retry
  await prisma.webhookLog.update({
    where: { id: dlqItem.webhookLogId },
    data: {
      status: "retrying",
      retry_count: 0,
      failed_at: null,
      failure_reason: null,
    },
  });

  // Mark DLQ item as replayed
  await prisma.webhookDeadLetterQueue.update({
    where: { id: dlqItemId },
    data: {
      replayed_at: new Date(),
    },
  });

  logger.info("Webhook replayed from DLQ", {
    dlqItemId,
    webhookLogId: dlqItem.webhookLogId,
    merchantId,
  });
}

/**
 * Delete an item from the DLQ
 */
export async function deleteWebhookFromDLQ(
  dlqItemId: string,
  merchantId: string,
): Promise<void> {
  const dlqItem = await prisma.webhookDeadLetterQueue.findUnique({
    where: { id: dlqItemId },
  });

  if (!dlqItem) {
    throw new Error(`DLQ item ${dlqItemId} not found`);
  }

  if (dlqItem.merchantId !== merchantId) {
    throw new Error("Unauthorized");
  }

  await prisma.webhookDeadLetterQueue.delete({
    where: { id: dlqItemId },
  });

  logger.info("Webhook deleted from DLQ", {
    dlqItemId,
    merchantId,
  });
}

/**
 * Clean up expired DLQ items (older than 30 days)
 * This should be called by a cron job periodically
 */
export async function cleanupExpiredDLQItems(): Promise<number> {
  const result = await prisma.webhookDeadLetterQueue.deleteMany({
    where: {
      expires_at: {
        lt: new Date(),
      },
    },
  });

  if (result.count > 0) {
    logger.info("Cleaned up expired DLQ items", { count: result.count });
  }

  return result.count;
}

/**
 * Get a single DLQ item by ID
 */
export async function getWebhookDLQItem(
  dlqItemId: string,
  merchantId: string,
): Promise<WebhookDLQItem> {
  const dlqItem = await prisma.webhookDeadLetterQueue.findUnique({
    where: { id: dlqItemId },
  });

  if (!dlqItem) {
    throw new Error(`DLQ item ${dlqItemId} not found`);
  }

  if (dlqItem.merchantId !== merchantId) {
    throw new Error("Unauthorized");
  }

  return dlqItem as WebhookDLQItem;
}
