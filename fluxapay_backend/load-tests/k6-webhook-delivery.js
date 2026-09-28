import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

/**
 * k6 Webhook Delivery Load Test
 *
 * Simulates 100 VUs hammering the internal webhook re-delivery endpoint for
 * 60 seconds to measure p99 delivery latency under concurrency.
 *
 * Required env vars:
 *   BASE_URL   – e.g. https://api.staging.fluxapay.com
 *   API_KEY    – service / admin API key with webhook:write scope
 *
 * Optional env vars:
 *   WEBHOOK_ID        – a real webhook config ID to re-trigger (default: uses
 *                       the test endpoint which creates a synthetic delivery)
 *   THINK_TIME_SECONDS – sleep between iterations (default 0)
 *   REQUIRE_STAGING_GUARD – set to "false" to allow non-staging URLs
 */

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/$/, "");
const API_KEY = __ENV.API_KEY || "";
const WEBHOOK_ID = __ENV.WEBHOOK_ID || "";
const THINK_TIME = Number(__ENV.THINK_TIME_SECONDS || 0);
const REQUIRE_STAGING_GUARD = (__ENV.REQUIRE_STAGING_GUARD || "true").toLowerCase() !== "false";

if (!BASE_URL) throw new Error("BASE_URL is required");
if (!API_KEY)  throw new Error("API_KEY is required");
if (REQUIRE_STAGING_GUARD && !/staging/i.test(BASE_URL)) {
  throw new Error(`Refusing to run against non-staging URL: ${BASE_URL}. Set REQUIRE_STAGING_GUARD=false to override.`);
}

const deliveryLatency = new Trend("webhook_delivery_latency", true);
const deliveryFailures = new Rate("webhook_delivery_failures");

export const options = {
  scenarios: {
    webhook_delivery: {
      executor: "constant-vus",
      vus: 100,
      duration: "60s",
    },
  },
  thresholds: {
    http_req_failed:          ["rate<0.02"],
    webhook_delivery_latency: ["p(99)<3000"],
    webhook_delivery_failures:["rate<0.02"],
  },
  summaryTrendStats: ["avg", "p(90)", "p(95)", "p(99)", "max"],
};

function headers() {
  return { "Content-Type": "application/json", "x-api-key": API_KEY };
}

export default function () {
  const url = WEBHOOK_ID
    ? `${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/redeliver`
    : `${BASE_URL}/api/v1/webhooks/test`;

  const payload = JSON.stringify({
    event_type: "payment.completed",
    payload: { id: `k6-${__VU}-${__ITER}`, amount: 100, currency: "USDC" },
  });

  const res = http.post(url, payload, { headers: headers(), tags: { name: "webhook_delivery" } });

  deliveryLatency.add(res.timings.duration);

  const ok = check(res, {
    "delivery accepted (2xx)": (r) => r.status >= 200 && r.status < 300,
  });
  deliveryFailures.add(!ok);

  if (THINK_TIME > 0) sleep(THINK_TIME);
}
