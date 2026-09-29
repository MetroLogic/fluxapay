import { Request, Response } from "express";
import {
  metricsMiddleware,
  renderPrometheusMetrics,
  trackPaymentConfirmed,
  trackPaymentCreated,
  trackSettlementBatchInitiated,
  trackWebhookDelivery,
} from "../metrics.middleware";
import { MetricEvent } from "../../types/logging.types";

const SAMPLE_LINE = /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})? -?[0-9.eE+-]+$/;
const HELP_LINE = /^# HELP [a-zA-Z_:][a-zA-Z0-9_:]* .+$/;
const TYPE_LINE = /^# TYPE [a-zA-Z_:][a-zA-Z0-9_:]* counter$/;

function mockResponse() {
  const res: any = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: undefined,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    set(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: unknown) {
      if (this.statusCode === 0) this.statusCode = 200;
      this.body = body;
      return this;
    },
    json(body: unknown) {
      if (this.statusCode === 0) this.statusCode = 200;
      this.body = body;
      return this;
    },
  };
  return res;
}

function mockRequest(path: string, headers: Record<string, string> = {}): Request {
  return {
    path,
    method: "GET",
    headers,
  } as unknown as Request;
}

function nextSpy() {
  return jest.fn((err?: unknown) => {
    if (err) throw err;
  });
}

describe("renderPrometheusMetrics", () => {
  it("renders the fluxapay counters in Prometheus text exposition format", () => {
    const events: MetricEvent[] = [
      { name: "payments_created_total", value: 3, type: "counter", timestamp: 1 },
      { name: "payments_created_total", value: 2, type: "counter", timestamp: 2 },
      { name: "payments_confirmed_total", value: 4, type: "counter", timestamp: 1 },
      { name: "webhook_deliveries_total", value: 5, type: "counter", tags: { status: "success" }, timestamp: 1 },
      { name: "webhook_deliveries_total", value: 1, type: "counter", tags: { status: "fail" }, timestamp: 2 },
      { name: "settlement_batches_total", value: 2, type: "counter", tags: { currency: "USDC" }, timestamp: 1 },
      { name: "payment_amount", value: 5000, type: "histogram", timestamp: 1 },
    ];

    const out = renderPrometheusMetrics(events);

    expect(out).toContain("# HELP fluxapay_payments_created_total Total number of payments created.");
    expect(out).toContain("# TYPE fluxapay_payments_created_total counter");
    expect(out).toContain("# TYPE fluxapay_payments_confirmed_total counter");
    expect(out).toContain("# TYPE fluxapay_webhook_delivery_total counter");
    expect(out).toContain("# TYPE fluxapay_settlement_batch_total counter");

    // Same family + labels are summed into one sample.
    expect(out).toContain("fluxapay_payments_created_total 5");
    expect(out).not.toContain("fluxapay_payments_created_total 2\n");

    // Label series match the status/currency dimensions.
    expect(out).toContain('fluxapay_webhook_delivery_total{status="success"} 5');
    expect(out).toContain('fluxapay_webhook_delivery_total{status="fail"} 1');
    expect(out).toContain('fluxapay_settlement_batch_total{currency="USDC"} 2');

    // Non-counter events are not exposed as counter samples.
    expect(out).not.toContain("fluxapay_payment_amount");

    // Every line is valid exposition text.
    const lines = out.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      if (line.startsWith("# HELP")) {
        expect(HELP_LINE.test(line)).toBe(true);
      } else if (line.startsWith("# TYPE")) {
        expect(TYPE_LINE.test(line)).toBe(true);
      } else {
        expect(SAMPLE_LINE.test(line)).toBe(true);
      }
    }
  });

  it("escapes label values per the exposition format", () => {
    const events: MetricEvent[] = [
      {
        name: "webhook_deliveries_total",
        value: 1,
        type: "counter",
        tags: { status: 'a"b\\c\nd' },
      },
    ];

    const out = renderPrometheusMetrics(events);
    expect(out).toContain('{status="a\\"b\\\\c\\nd"}');
  });

  it("returns an empty body when no counter family has samples", () => {
    const events: MetricEvent[] = [{ name: "payment_amount", value: 5, type: "histogram" }];
    expect(renderPrometheusMetrics(events)).toBe("\n");
  });
});

describe("metricsMiddleware /metrics endpoint (smoke)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAdminSecret = process.env.ADMIN_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ADMIN_SECRET = originalAdminSecret;
  });

  beforeEach(() => {
    // Seed the shared collector so the endpoint has real counters to render.
    trackPaymentCreated();
    trackPaymentCreated();
    trackPaymentConfirmed();
    trackWebhookDelivery("success");
    trackSettlementBatchInitiated(3, "USDC");
  });

  it("rejects unauthenticated scrapes when an admin secret is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_SECRET = "op-secret";

    const res = mockResponse();
    const next = nextSpy();
    metricsMiddleware(mockRequest("/metrics"), res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("serves valid Prometheus text to an authorized scrape", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_SECRET = "op-secret";

    const res = mockResponse();
    const next = nextSpy();
    metricsMiddleware(
      mockRequest("/metrics", { "x-admin-secret": "op-secret" }),
      res as unknown as Response,
      next,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/plain");
    expect(String(res.body)).toContain("# TYPE fluxapay_payments_created_total counter");
    expect(String(res.body)).toContain("fluxapay_payments_created_total");
    expect(String(res.body)).toContain('fluxapay_webhook_delivery_total{status="success"}');
    expect(String(res.body)).toContain('fluxapay_settlement_batch_total{currency="USDC"}');
    expect(next).not.toHaveBeenCalled();

    const lines = String(res.body).trim().split("\n");
    for (const line of lines) {
      if (!line.startsWith("#")) {
        expect(SAMPLE_LINE.test(line)).toBe(true);
      }
    }
  });

  it("passes non-metrics requests through untouched", () => {
    const res = mockResponse();
    const next = nextSpy();
    metricsMiddleware(mockRequest("/api/v1/payments"), res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(res.body).toBeUndefined();
  });
});