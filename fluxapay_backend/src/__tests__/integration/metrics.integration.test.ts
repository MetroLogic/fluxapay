import express from "express";
import request from "supertest";
import { metricsMiddleware, trackPaymentFailed, trackPaymentStageDuration } from "../../middleware/metrics.middleware";

describe("Prometheus metrics endpoint", () => {
  const app = express();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAdminSecret = process.env.ADMIN_SECRET;

  beforeAll(() => {
    app.use(metricsMiddleware);
  });

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_SECRET = "metrics-test-secret";
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalAdminSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = originalAdminSecret;
  });

  it("rejects scrapes without the configured admin secret", async () => {
    const response = await request(app).get("/metrics");

    expect(response.status).toBe(401);
  });

  it("serves runtime and payment metrics to an authorized scraper", async () => {
    trackPaymentStageDuration("onchain_confirmation", 1.25);
    trackPaymentStageDuration("off_ramp_settlement", 2.5);
    trackPaymentFailed("stellar_timeout", "USDC");

    const response = await request(app)
      .get("/metrics")
      .set("X-Admin-Secret", "metrics-test-secret");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("process_cpu_user_seconds_total");
    expect(response.text).toContain("fluxapay_payment_stage_duration_seconds_bucket");
    expect(response.text).toContain('stage="onchain_confirmation"');
    expect(response.text).toContain('stage="off_ramp_settlement"');
    expect(response.text).toContain("fluxapay_payments_failed_total");
    expect(response.text).toContain('error_code="stellar_timeout"');
    expect(response.text).toContain('currency="USDC"');
  });
});