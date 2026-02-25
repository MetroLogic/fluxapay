export type WebhookStatus = 'delivered' | 'pending' | 'failed';

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
    [key: string]: unknown;
  };
  retryHistory: {
    timestamp: string;
    status: WebhookStatus;
    responseCode: number;
  }[];
}

export const mockWebhooks: WebhookEvent[] = [
  {
    id: "wh_evt_01J0...",
    paymentId: "pay_01J0...",
    eventType: "payment.success",
    status: "delivered",
    endpoint: "https://api.merchant.com/webhooks/fluxapay",
    attempts: 1,
    lastAttempt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    payload: {
      event: "payment.success",
      data: {
        paymentId: "pay_01J0...",
        amount: 1500,
        currency: "USDC",
        status: "confirmed"
      }
    },
    response: {
      status: 200,
      body: "OK"
    },
    retryHistory: [
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        status: "delivered",
        responseCode: 200
      }
    ]
  },
  {
    id: "wh_evt_02K1...",
    paymentId: "pay_02K1...",
    eventType: "payment.failed",
    status: "pending",
    endpoint: "https://api.merchant.com/webhooks/fluxapay",
    attempts: 3,
    lastAttempt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    payload: {
      event: "payment.failed",
      data: {
        paymentId: "pay_02K1...",
        amount: 50.5,
        currency: "XLM",
        status: "failed",
        reason: "insufficient_funds"
      }
    },
    response: {
      status: 503,
      body: "Service Unavailable"
    },
    retryHistory: [
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        status: "failed",
        responseCode: 503
      },
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        status: "failed",
        responseCode: 503
      },
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        status: "failed",
        responseCode: 503
      }
    ]
  },
  {
    id: "wh_evt_03L2...",
    paymentId: "pay_03L2...",
    eventType: "payout.completed",
    status: "failed",
    endpoint: "https://api.merchant.com/webhooks/fluxapay",
    attempts: 5,
    lastAttempt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    payload: {
      event: "payout.completed",
      data: {
        payoutId: "po_03L2...",
        amount: 10000,
        currency: "USDC",
        status: "completed"
      }
    },
    response: {
      status: 404,
      body: "Not Found"
    },
    retryHistory: [
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
        status: "failed",
        responseCode: 404
      },
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        status: "failed",
        responseCode: 404
      }
    ]
  }
];
