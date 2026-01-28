import { PrismaClient, WebhookEventType, WebhookStatus } from "../generated/client/client";
import { webhookEventTypes } from "../schemas/webhook.schema";

const prisma = new PrismaClient();

interface GetWebhookLogsParams {
  merchantId: string;
  event_type?: WebhookEventType;
  status?: WebhookStatus;
  date_from?: string;
  date_to?: string;
  search?: string;
  page: number;
  limit: number;
}

interface WebhookLogDetailsParams {
  merchantId: string;
  log_id: string;
}

interface RetryWebhookParams {
  merchantId: string;
  log_id: string;
}

interface SendTestWebhookParams {
  merchantId: string;
  event_type: WebhookEventType;
  endpoint_url: string;
  payload_override?: Record<string, any>;
}

export async function getWebhookLogsService(params: GetWebhookLogsParams) {
  const {
    merchantId,
    event_type,
    status,
    date_from,
    date_to,
    search,
    page,
    limit,
  } = params;

  const skip = (page - 1) * limit;

  const where: any = {
    merchantId,
  };

  if (event_type) {
    where.event_type = event_type;
  }

  if (status) {
    where.status = status;
  }

  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) {
      where.created_at.gte = new Date(date_from);
    }
    if (date_to) {
      where.created_at.lte = new Date(date_to);
    }
  }

  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { payment_id: { contains: search, mode: "insensitive" } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.webhookLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        event_type: true,
        endpoint_url: true,
        http_status: true,
        status: true,
        payment_id: true,
        retry_count: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.webhookLog.count({ where }),
  ]);

  return {
    message: "Webhook logs retrieved successfully",
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    },
  };
}

export async function getWebhookLogDetailsService(params: WebhookLogDetailsParams) {
  const { merchantId, log_id } = params;

  const log = await prisma.webhookLog.findFirst({
    where: {
      id: log_id,
      merchantId,
    },
    include: {
      retryAttempts: {
        orderBy: { attempt_number: "asc" },
      },
    },
  });

  if (!log) {
    throw { status: 404, message: "Webhook log not found" };
  }

  return {
    message: "Webhook log details retrieved successfully",
    data: {
      id: log.id,
      event_type: log.event_type,
      endpoint_url: log.endpoint_url,
      request_payload: log.request_payload,
      response_body: log.response_body,
      http_status: log.http_status,
      status: log.status,
      payment_id: log.payment_id,
      retry_count: log.retry_count,
      max_retries: log.max_retries,
      next_retry_at: log.next_retry_at,
      created_at: log.created_at,
      updated_at: log.updated_at,
      retry_attempts: log.retryAttempts.map((attempt) => ({
        attempt_number: attempt.attempt_number,
        http_status: attempt.http_status,
        response_body: attempt.response_body,
        error_message: attempt.error_message,
        timestamp: attempt.created_at,
      })),
    },
  };
}

export async function retryWebhookService(params: RetryWebhookParams) {
  const { merchantId, log_id } = params;

  const log = await prisma.webhookLog.findFirst({
    where: {
      id: log_id,
      merchantId,
    },
  });

  if (!log) {
    throw { status: 404, message: "Webhook log not found" };
  }

  if (log.status === "delivered") {
    throw { status: 400, message: "Webhook already delivered successfully" };
  }

  // Attempt to deliver the webhook
  const result = await deliverWebhook(
    log.endpoint_url,
    log.request_payload as Record<string, any>
  );

  const newRetryCount = log.retry_count + 1;
  const newStatus: WebhookStatus = result.success ? "delivered" : 
    newRetryCount >= log.max_retries ? "failed" : "retrying";

  // Create retry attempt record
  await prisma.webhookRetryAttempt.create({
    data: {
      webhookLogId: log.id,
      attempt_number: newRetryCount,
      http_status: result.httpStatus,
      response_body: result.responseBody,
      error_message: result.error,
    },
  });

  // Calculate next retry time with exponential backoff
  const nextRetryAt = newStatus === "retrying" 
    ? new Date(Date.now() + Math.pow(2, newRetryCount) * 60 * 1000) // exponential backoff in minutes
    : null;

  // Update the webhook log
  const updatedLog = await prisma.webhookLog.update({
    where: { id: log.id },
    data: {
      status: newStatus,
      retry_count: newRetryCount,
      http_status: result.httpStatus,
      response_body: result.responseBody,
      next_retry_at: nextRetryAt,
    },
  });

  return {
    message: result.success 
      ? "Webhook retry successful" 
      : `Webhook retry failed${newStatus === "retrying" ? ", will retry again" : ""}`,
    data: {
      id: updatedLog.id,
      status: updatedLog.status,
      http_status: updatedLog.http_status,
      retry_count: updatedLog.retry_count,
      next_retry_at: updatedLog.next_retry_at,
    },
  };
}

export async function sendTestWebhookService(params: SendTestWebhookParams) {
  const { merchantId, event_type, endpoint_url, payload_override } = params;

  // Verify merchant exists
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });

  if (!merchant) {
    throw { status: 404, message: "Merchant not found" };
  }

  // Generate test payload
  const testPayload = generateTestPayload(event_type, payload_override);

  // Create webhook log for the test
  const webhookLog = await prisma.webhookLog.create({
    data: {
      merchantId,
      event_type,
      endpoint_url,
      request_payload: testPayload,
      status: "pending",
    },
  });

  // Attempt to deliver the webhook
  const result = await deliverWebhook(endpoint_url, testPayload);

  const status: WebhookStatus = result.success ? "delivered" : "failed";

  // Update the webhook log with the result
  const updatedLog = await prisma.webhookLog.update({
    where: { id: webhookLog.id },
    data: {
      status,
      http_status: result.httpStatus,
      response_body: result.responseBody,
    },
  });

  return {
    message: result.success 
      ? "Test webhook delivered successfully" 
      : "Test webhook delivery failed",
    data: {
      id: updatedLog.id,
      event_type: updatedLog.event_type,
      endpoint_url: updatedLog.endpoint_url,
      request_payload: updatedLog.request_payload,
      response_body: updatedLog.response_body,
      http_status: updatedLog.http_status,
      status: updatedLog.status,
      created_at: updatedLog.created_at,
    },
  };
}

// Helper function to deliver webhook
async function deliverWebhook(
  endpointUrl: string,
  payload: Record<string, any>
): Promise<{
  success: boolean;
  httpStatus?: number;
  responseBody?: string;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": generateWebhookSignature(payload),
        "X-Webhook-Timestamp": new Date().toISOString(),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await response.text();

    return {
      success: response.ok,
      httpStatus: response.status,
      responseBody: responseBody.substring(0, 10000), // Limit response body size
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error occurred",
    };
  }
}

// Helper function to generate webhook signature
function generateWebhookSignature(payload: Record<string, any>): string {
  const crypto = require("crypto");
  const secret = process.env.WEBHOOK_SECRET || "webhook-secret";
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest("hex");
}

// Helper function to generate test payload based on event type
function generateTestPayload(
  eventType: WebhookEventType,
  override?: Record<string, any>
): Record<string, any> {
  const basePayload = {
    webhook_id: `test_${Date.now()}`,
    event_type: eventType,
    timestamp: new Date().toISOString(),
    test_mode: true,
  };

  const eventPayloads: Record<string, Record<string, any>> = {
    payment_completed: {
      payment_id: `pay_test_${Date.now()}`,
      amount: 100.00,
      currency: "USD",
      status: "completed",
      customer_email: "test@example.com",
    },
    payment_failed: {
      payment_id: `pay_test_${Date.now()}`,
      amount: 100.00,
      currency: "USD",
      status: "failed",
      failure_reason: "Insufficient funds",
      customer_email: "test@example.com",
    },
    payment_pending: {
      payment_id: `pay_test_${Date.now()}`,
      amount: 100.00,
      currency: "USD",
      status: "pending",
      customer_email: "test@example.com",
    },
    refund_completed: {
      refund_id: `ref_test_${Date.now()}`,
      payment_id: `pay_test_${Date.now()}`,
      amount: 50.00,
      currency: "USD",
      status: "completed",
    },
    refund_failed: {
      refund_id: `ref_test_${Date.now()}`,
      payment_id: `pay_test_${Date.now()}`,
      amount: 50.00,
      currency: "USD",
      status: "failed",
      failure_reason: "Refund window expired",
    },
    subscription_created: {
      subscription_id: `sub_test_${Date.now()}`,
      plan_id: "plan_test",
      customer_email: "test@example.com",
      status: "active",
      billing_cycle: "monthly",
    },
    subscription_cancelled: {
      subscription_id: `sub_test_${Date.now()}`,
      plan_id: "plan_test",
      customer_email: "test@example.com",
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    },
    subscription_renewed: {
      subscription_id: `sub_test_${Date.now()}`,
      plan_id: "plan_test",
      customer_email: "test@example.com",
      status: "active",
      renewed_at: new Date().toISOString(),
      next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  };

  return {
    ...basePayload,
    data: {
      ...eventPayloads[eventType],
      ...override,
    },
  };
}

// Export for use in other services (e.g., payment service to trigger webhooks)
export async function createAndDeliverWebhook(
  merchantId: string,
  eventType: WebhookEventType,
  endpointUrl: string,
  payload: Record<string, any>,
  paymentId?: string
) {
  const webhookLog = await prisma.webhookLog.create({
    data: {
      merchantId,
      event_type: eventType,
      endpoint_url: endpointUrl,
      request_payload: payload,
      payment_id: paymentId,
      status: "pending",
    },
  });

  const result = await deliverWebhook(endpointUrl, payload);
  const status: WebhookStatus = result.success ? "delivered" : "retrying";

  const nextRetryAt = status === "retrying" 
    ? new Date(Date.now() + 60 * 1000) // First retry in 1 minute
    : null;

  await prisma.webhookLog.update({
    where: { id: webhookLog.id },
    data: {
      status,
      http_status: result.httpStatus,
      response_body: result.responseBody,
      next_retry_at: nextRetryAt,
    },
  });

  return webhookLog;
}
