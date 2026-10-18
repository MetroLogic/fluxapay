import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Configurable via environment variables.
// BASE_URL: target API (local or staging)
// VUS: number of concurrent virtual users
// DURATION: test duration
// RAMP_UP: ramp-up duration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '1m';
const RAMP_UP = __ENV.RAMP_UP || '30s';
const POLL_ATTEMPTS = Number(__ENV.POLL_ATTEMPTS || 5);
const POLL_INTERVAL = Number(__ENV.POLL_INTERVAL || 1);

const checkoutErrors = new Rate('checkout_errors');
const checkoutDuration = new Trend('checkout_duration', true);

export const options = {
  scenarios: {
    checkout_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<250'],
    http_req_failed: ['rate<0.01'],
    checkout_errors: ['rate<0.01'],
  },
};

function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

function randomAmount() {
  return (Math.floor(Math.random() * 900) + 100) / 100;
}

export default function () {
  const start = Date.now();
  let failed = false;

  // 1. Fetch payment details for a checkout session.
  const paymentRes = http.get(`${BASE_URL}/api/payments/checkout`, {
    headers: jsonHeaders(),
    tags: { name: 'fetch_payment_details' },
  });
  const paymentOk = check(paymentRes, {
    'fetch payment details status is 200': (r) => r.status === 200,
  });
  if (!paymentOk) failed = true;

  // 2. Create a deposit address for the checkout.
  const depositPayload = JSON.stringify({
    amount: randomAmount(),
    currency: 'USDC',
  });
  const depositRes = http.post(`${BASE_URL}/api/payments/deposit-address`, depositPayload, {
    headers: jsonHeaders(),
    tags: { name: 'create_deposit_address' },
  });
  const depositOk = check(depositRes, {
    'create deposit address status is 200/201': (r) => r.status === 200 || r.status === 201,
  });
  if (!depositOk) failed = true;

  let depositId = null;
  if (depositOk) {
    try {
      const body = depositRes.json();
      depositId = body && (body.id || body.depositId || body.address);
    } catch (e) {
      depositId = null;
    }
  }

  // 3. Poll payment status until settled or attempts exhausted.
  if (depositId) {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      const statusRes = http.get(
        `${BASE_URL}/api/payments/status/${encodeURIComponent(depositId)}`,
        { headers: jsonHeaders(), tags: { name: 'poll_payment_status' } },
      );
      const statusOk = check(statusRes, {
        'poll payment status status is 200': (r) => r.status === 200,
      });
      if (!statusOk) {
        failed = true;
        break;
      }
      let settled = false;
      try {
        const body = statusRes.json();
        settled = body && (body.status === 'confirmed' || body.status === 'completed');
      } catch (e) {
        settled = false;
      }
      if (settled) break;
      sleep(POLL_INTERVAL);
    }
  }

  checkoutErrors.add(failed);
  checkoutDuration.add(Date.now() - start);

  sleep(1);
}
