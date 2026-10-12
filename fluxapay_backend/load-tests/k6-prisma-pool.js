import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/$/, "");
const API_KEY = __ENV.API_KEY || "";
const failures = new Rate("database_request_failures");

if (!BASE_URL) throw new Error("BASE_URL is required");
if (!API_KEY) throw new Error("API_KEY is required");

export const options = {
  scenarios: {
    concurrent_database_requests: {
      executor: "constant-vus",
      vus: 100,
      duration: "60s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    database_request_failures: ["rate<0.02"],
  },
};

export default function () {
  const response = http.get(`${BASE_URL}/api/v1/payments?page=1&limit=20`, {
    headers: { "x-api-key": API_KEY },
    tags: { name: "pooled_database_request" },
  });
  const ok = check(response, {
    "database request succeeds": (res) => res.status >= 200 && res.status < 300,
    "no connection exhaustion response": (res) => res.status !== 500 && res.status !== 503,
  });
  failures.add(!ok);
}