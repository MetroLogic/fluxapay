import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/$/, "");
const API_KEY = __ENV.API_KEY || "";
const CURRENCY = __ENV.CURRENCY || "USDC";
const RAMP_VUS = Number(__ENV.RAMP_VUS || 20);
const STEADY_VUS = Number(__ENV.STEADY_VUS || 30);
const RAMP_UP = __ENV.RAMP_UP || "2m";
const STEADY_DURATION = __ENV.STEADY_DURATION || "8m";
const RAMP_DOWN = __ENV.RAMP_DOWN || "2m";
const THINK_TIME_SECONDS = Number(__ENV.THINK_TIME_SECONDS || 1);
const LIST_LIMIT = Number(__ENV.LIST_LIMIT || 20);

const REQUIRE_STAGING_GUARD = (__ENV.REQUIRE_STAGING_GUARD || "true").toLowerCase() !== "false";
const isLikelyStagingUrl = /^https?:\/\/[^/]*staging[^/]*\./i.test(BASE_URL) || /\/staging\b/i.test(BASE_URL);

if (!BASE_URL) {
  throw new Error("BASE_URL is required (example: https://api.staging.fluxapay.com)");
}
if (!API_KEY) {
  throw new Error("API_KEY is required");
}
if (REQUIRE_STAGING_GUARD && !isLikelyStagingUrl) {
  throw new Error(
    `Refusing to run against non-staging BASE_URL: ${BASE_URL}. ` +
      "Use a staging URL or set REQUIRE_STAGING_GUARD=false explicitly.",
  );
}

const createLatency = new Trend("payments_create_latency", true);
const listLatency = new Trend("payments_list_latency", true);
const flowFailures = new Rate("payments_create_list_failures");

export const options = {
  scenarios: {
    payments_create_and_list: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: RAMP_UP, target: RAMP_VUS },
        { duration: STEADY_DURATION, target: STEADY_VUS },
        { duration: RAMP_DOWN, target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<1500"],
    payments_create_latency: ["p(95)<1200"],
    payments_list_latency: ["p(95)<800"],
    payments_create_list_failures: ["rate<0.02"],
  },
  summaryTrendStats: ["avg", "p(90)", "p(95)", "p(99)", "max"],
};

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
  };
}

function createPayload() {
  const uniq = `${Date.now()}_${__VU}_${__ITER}`;
  return JSON.stringify({
    amount: 100 + (__ITER % 25),
    currency: CURRENCY,
    customer_email: `k6-${uniq}@example.com`,
    description: "k6 payment create+list scenario",
    metadata: { source: "k6", scenario: "payment-create-list", vu: __VU, iter: __ITER },
  });
}

export default function () {
  let failed = false;

  const createRes = http.post(`${BASE_URL}/api/v1/payments`, createPayload(), {
    headers: authHeaders(),
    tags: { name: "payments_create" },
  });
  createLatency.add(createRes.timings.duration);
  const createOk = check(createRes, {
    "create status is 201": (r) => r.status === 201,
    "create returns id": (r) => {
      try {
        const parsed = r.json();
        return !!parsed?.id;
      } catch {
        return false;
      }
    },
  });
  if (!createOk) failed = true;

  const listRes = http.get(`${BASE_URL}/api/v1/payments?page=1&limit=${LIST_LIMIT}`, {
    headers: authHeaders(),
    tags: { name: "payments_list" },
  });
  listLatency.add(listRes.timings.duration);
  const listOk = check(listRes, {
    "list status is 200": (r) => r.status === 200,
    "list has array payload": (r) => {
      try {
        const parsed = r.json();
        return Array.isArray(parsed?.payments) || Array.isArray(parsed?.data);
      } catch {
        return false;
      }
    },
  });
  if (!listOk) failed = true;

  flowFailures.add(failed);
  sleep(THINK_TIME_SECONDS);
}
