import { z } from 'zod';

// Canonical event names aligned with product spec
export const webhookEventTypes = [
  // Payment events (canonical names)
  'payment.created',
  'payment.pending',
  'payment.confirmed',
  'payment.failed',
  'payment.settled',
  // Refund events
  'refund.created',
  'refund.completed',
  'refund.failed',
  // Subscription events
  'subscription.created',
  'subscription.cancelled',
  'subscription.renewed',
  // Legacy event names (for backward compatibility)
  'payment_completed',
  'payment_confirmed',
  'payment_failed',
  'payment_pending',
  'refund_completed',
  'refund_failed',
  'subscription_created',
  'subscription_cancelled',
  'subscription_renewed',
] as const;

export const webhookStatuses = [
  'pending',
  'delivered',
  'failed',
  'retrying',
] as const;

export const getWebhookLogsSchema = z.object({
  event_type: z.enum(webhookEventTypes).optional(),
  status: z.enum(webhookStatuses).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const getWebhookLogDetailsSchema = z.object({
  log_id: z.string().min(1, 'Log ID is required'),
});

export const retryWebhookSchema = z.object({
  log_id: z.string().min(1, 'Log ID is required'),
});

export const sendTestWebhookSchema = z.object({
  event_type: z.enum(webhookEventTypes),
  endpoint_url: z.string().url('Invalid endpoint URL'),
  payload_override: z.record(z.string(), z.any()).optional(),
});

export const getDeadLetterQueueSchema = z.object({
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  merchant_id: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const requeueWebhookSchema = z.object({
  log_id: z.string().min(1, 'Log ID is required'),
});
