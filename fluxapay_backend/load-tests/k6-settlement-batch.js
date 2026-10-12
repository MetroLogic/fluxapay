import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

/**
 * k6 Settlement Batch Load Test
 *
 * Simulates 50 merchant settlement operations running concurrently to stress
 * the batch endpoint (FX lookups + DB writes).  Each VU represents one merchant.
 *
 * Required env vars:
 *   BASE_URL   – e.g. https://api.staging.fluxapay.com
 *   API_KEY    – service / admin API key with settlement:write scope
 *
 * Optional env vars:
 *   MERCHANT_COUNT     – number of synthetic merchants / VUs (default 50)
 *   ITERATIONS         – how many batch rounds per VU (default 3)
 *   THINK_TIME_SECONDS – sleep between iterations (default 1)
 *   REQUIRE_STAGING_GUARD – set to "false" to allow non-staging URLs
 */

const BASE_URL       = (__ENV.BASE_URL || "").replace(/\/$/, "");
const API_KEY        = __ENV.API_KEY || "";
const MERCHANT_COUNT = Number(__ENV.MERCHANT_COUNT || 50);
const ITERATIONS     = Number(__ENV.ITERATIONS || 3);
const THINK_TIME     = Number(__ENV.THINK_TIME_SECONDS || 1);
const REQUIRE_STAGING_GUARD = (__ENV.REQUIRE_STAGING_GUARD || "true").toLowerCase() !== "false";

if (!BASE_URL) throw new Error("BASE_URL is required");
if (!API_KEY)  throw new Error("API_KEY is required");
if (REQUIRE_STAGING_GUARD && !/staging/i.test(BASE_URL)) {
  throw new Error(`Refusing to run against non-staging URL: ${BASE_URL}. Set REQUIRE_STAGING_GUARD=false to override.`);
}

const settlementLatency  = new Trend("settlement_batch_latency", true);
const settlementFailures = new Rate("settlement_batch_failures");

export const options = {
  scenarios: {
    settlement_batch: {
      executor: "per-vu-iterations",
      vus:        MERCHANT_COUNT,
      iterations: ITERATIONS,
      maxDuration: "5m",
    },
  },
  thresholds: {
    http_req_failed:           ["rate<0.02"],
    settlement_batch_latency:  ["p(95)<5000"],
    settlement_batch_failures: ["rate<0.02"],
  },
  summaryTrendStats: ["avg", "p(90)", "p(95)", "p(99)", "max"],
};

function headers() {
  return { "Content-Type": "application/json", "x-api-key": API_KEY };
}

export default function () {
  // Each VU acts as a distinct merchant identified by its VU number
  const merchantRef = `k6-merchant-${__VU}`;

  const payload = JSON.stringify({
    merchant_ref: merchantRef,
    currency:     "USDC",
    dry_run:      false,
    metadata:     { source: "k6", vu: __VU, iter: __ITER },
  });

  const res = http.post(
    `${BASE_URL}/api/v1/settlements/batch`,
    payload,
    { headers: headers(), tags: { name: "settlement_batch" } },
  );

  settlementLatency.add(res.timings.duration);

  const ok = check(res, {
    "settlement accepted (2xx)": (r) => r.status >= 200 && r.status < 300,
  });
  settlementFailures.add(!ok);

  sleep(THINK_TIME);
}
