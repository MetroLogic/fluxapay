export type WebhookStatus = 'delivered' | 'pending' | 'failed' | 'retrying';

export interface WebhookEvent {
  id: string;
  paymentId: string;
  eventType: string;
  status: WebhookStatus;
  endpoint: string;
  attempts: number;
  lastAttempt: string;
  createdAt: string;
  payload: Record<string, unknown>;
  response: {
    status: number;
    body?: string;
    [key: string]: unknown;
  };
  retryHistory: {
    timestamp: string;
    status: WebhookStatus;
    responseCode: number;
  }[];
}
