# Status callbacks and redirects

There are three ways to learn that a checkout session (payment) changed state:

1. **Webhooks** (recommended). FluxaPay POSTs a signed event to your webhook URL. Use this to fulfil orders.
2. **Polling** the public status endpoints. Good for your own "waiting for payment" UI.
3. **Server-Sent Events** from `GET /api/v1/payments/{id}/stream`.

The browser redirect to `success_url` is a convenience for the customer. It is **not** proof of
payment: anyone can open that URL. Always confirm with a verified webhook or an authenticated
`GET /api/v1/payments/{id}` before you ship goods.

## Payment statuses

| Status | Meaning | Terminal |
|--------|---------|----------|
| `pending` | Waiting for funds at `stellar_address`. | no |
| `partially_paid` | Some funds arrived, less than `amount`. | no |
| `confirmed` | Full amount received and verified. Fulfil the order. | yes* |
| `overpaid` | More than `amount` received. | yes* |
| `paid` / `completed` | Payment finished. | yes* |
| `expired` | `expiration` passed before full payment. | yes |
| `failed` | Payment could not be completed. | yes |
| `cancelled` | Cancelled before payment. | yes |
| `refunded` / `partially_refunded` | Funds (partly) returned after payment. | yes |

\* A successful payment can still move to `refunded` / `partially_refunded` later.

## Webhooks

Set your endpoint with `PATCH /api/v1/merchants/me/webhook` (or in the dashboard). FluxaPay sends:

```http
POST /webhooks/fluxapay HTTP/1.1
Content-Type: application/json
X-FluxaPay-Timestamp: 2026-10-15T12:04:10.512Z
X-FluxaPay-Signature: 3f1d9c...e7a2

{"event":"payment.confirmed","event_id":"9b2d7c4e-1f3a-4b5c-8d6e-7f8091a2b3c4","timestamp":"2026-10-15T12:04:10.512Z","data":{"payment_id":"6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41","amount":"120.5","currency":"USDC","status":"confirmed","transaction_hash":"a3f9...c1"}}
```

| Field | Description |
|-------|-------------|
| `event` | Event name, e.g. `payment.confirmed` (see below). |
| `event_id` | Unique per delivery attempt group. Use it to de-duplicate retries. |
| `timestamp` | When the event was signed (same value as `X-FluxaPay-Timestamp`). |
| `data.payment_id` | The checkout session ID. |
| `data.amount` | Decimal string. |
| `data.status` | Payment status at the time of the event. |
| `data.transaction_hash` | Stellar transaction hash, or `null`. |

### Event names

`payment.created`, `payment.pending`, `payment.confirmed`, `payment.failed`, `payment.expired`,
`payment.expiring_soon`, `payment.settled`, `payment.duplicate_received`, `refund.created`,
`refund.completed`, `refund.failed`, `invoice.paid`, `invoice.overdue`, `subscription.created`,
`subscription.cancelled`, `subscription.renewed`.

Older underscore names (`payment_confirmed`, …) are still accepted for backward compatibility.

### Responding

Return any `2xx` within a few seconds. Do slow work (emails, fulfilment) after you respond.
Non-2xx responses and timeouts are logged as failed deliveries and can be retried from the dashboard
or with `POST /api/v1/webhooks/logs/{log_id}/retry`, so make your handler idempotent on `event_id`.

### Verifying signatures

The signature is `hex(HMAC-SHA256(webhook_secret, "{X-FluxaPay-Timestamp}.{raw body}"))`.

1. Read the **raw** request body. Do not parse and re-serialize it.
2. Recompute the HMAC and compare it with `X-FluxaPay-Signature` in **constant time**.
3. Reject the request if the timestamp is more than 5 minutes from your clock (replay protection).

<details open>
<summary><strong>JavaScript</strong> (Express + <code>@fluxapay/sdk</code>)</summary>

```js
import express from 'express';
import { webhooks, SignatureVerificationError, TimestampToleranceError } from '@fluxapay/sdk';

const app = express();

app.post('/webhooks/fluxapay', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    // Throws SignatureVerificationError or TimestampToleranceError (300 s default tolerance).
    event = webhooks.verifySignature(req.body, req.headers, process.env.FLUXAPAY_WEBHOOK_SECRET);
  } catch (err) {
    if (err instanceof SignatureVerificationError || err instanceof TimestampToleranceError) {
      return res.status(400).send(err.message);
    }
    throw err;
  }

  if (event.event === 'payment.confirmed') {
    // fulfil order for event.data.payment_id
  }
  res.sendStatus(200);
});
```

</details>

<details>
<summary><strong>Python</strong> (Flask)</summary>

```python
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone

from flask import Flask, abort, request

app = Flask(__name__)
SECRET = os.environ["FLUXAPAY_WEBHOOK_SECRET"].encode()
TOLERANCE_SECONDS = 300


@app.post("/webhooks/fluxapay")
def fluxapay_webhook():
    raw = request.get_data()  # raw bytes, not request.json
    timestamp = request.headers.get("X-FluxaPay-Timestamp", "")
    signature = request.headers.get("X-FluxaPay-Signature", "")

    expected = hmac.new(SECRET, timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature.lower()):
        abort(400, "invalid signature")

    sent_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if abs((datetime.now(timezone.utc) - sent_at).total_seconds()) > TOLERANCE_SECONDS:
        abort(400, "stale webhook")

    event = json.loads(raw)
    if event["event"] == "payment.confirmed":
        pass  # fulfil order for event["data"]["payment_id"]
    return "", 200
```

</details>

<details>
<summary><strong>Go</strong> (net/http)</summary>

```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const tolerance = 5 * time.Minute

func fluxapayWebhook(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	timestamp := r.Header.Get("X-FluxaPay-Timestamp")
	signature := strings.ToLower(r.Header.Get("X-FluxaPay-Signature"))

	mac := hmac.New(sha256.New, []byte(os.Getenv("FLUXAPAY_WEBHOOK_SECRET")))
	mac.Write([]byte(timestamp + "."))
	mac.Write(raw)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		http.Error(w, "invalid signature", http.StatusBadRequest)
		return
	}

	sentAt, err := time.Parse(time.RFC3339Nano, timestamp)
	if err != nil || time.Since(sentAt).Abs() > tolerance {
		http.Error(w, "stale webhook", http.StatusBadRequest)
		return
	}

	var event struct {
		Event string `json:"event"`
		Data  struct {
			PaymentID string `json:"payment_id"`
			Status    string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &event); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if event.Event == "payment.confirmed" {
		// fulfil order for event.Data.PaymentID
	}
	w.WriteHeader(http.StatusOK)
}

func main() {
	http.HandleFunc("/webhooks/fluxapay", fluxapayWebhook)
	_ = http.ListenAndServe(":8080", nil)
}
```

</details>

Send yourself a signed test event with `POST /api/v1/webhooks/test` and inspect deliveries with
`GET /api/v1/webhooks/logs`.

## Redirects: `success_url` and `cancel_url`

Both are set when you [create a checkout session](./checkout-sessions.md#create-a-checkout-session).
They must be absolute `https://` URLs (max 2048 characters).

| URL | When the customer lands there |
|-----|-------------------------------|
| `success_url` | Automatically, about 2 seconds after the hosted page sees status `confirmed`. A "Return to merchant" button is also shown. |
| `cancel_url` | Stored on the payment and returned to the checkout page as `cancelUrl`. The hosted page does not render a cancel button yet, so don't rely on it as your only exit path. |

FluxaPay redirects to the URL **exactly as you provided it** and does not append query parameters.
Put whatever you need to identify the order in the URL yourself:

```text
https://shop.example.com/orders/1234/thanks?payment_id=6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41
```

On your success page, look up the payment server-side before you show "paid":

```bash
curl "$FLUXAPAY_BASE_URL/api/v1/payments/6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41" \
  -H "Authorization: Bearer $FLUXAPAY_API_KEY"
```

Redirect URLs are sanitized on the checkout page; `javascript:`, `data:` and similar schemes are
never followed.

Payment links store a `redirect_url` and return it from the management endpoints, but charges created
through `/resolve/{slug}/charge` don't set a `success_url` yet. Use webhooks to react to link payments.

## Polling

| Endpoint | Auth | Response |
|----------|------|----------|
| `GET /api/v1/payments/checkout/{id}/status` | Public | `{ "status": "pending" }` |
| `GET /api/v1/payments/{id}/status` | Public | `{ id, status, amount, currency, address, expiresAt }` |
| `GET /api/v1/payments/{id}` | API key | Full payment |

```bash
curl "$FLUXAPAY_BASE_URL/api/v1/payments/6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41/status"
```

```json
{
  "id": "6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41",
  "status": "pending",
  "amount": 120.5,
  "currency": "USDC",
  "address": "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
  "expiresAt": "2026-10-15T12:30:00.000Z"
}
```

Poll every 3–5 seconds and stop once the status is terminal. Public endpoints are rate limited per IP
(see [rate limits](./README.md#rate-limits)); on `429`, wait for `Retry-After` seconds.

<details>
<summary><strong>JavaScript</strong></summary>

```js
async function waitForPayment(id, { intervalMs = 4000 } = {}) {
  const terminal = new Set(['confirmed', 'overpaid', 'paid', 'completed', 'expired', 'failed', 'cancelled']);
  for (;;) {
    const res = await fetch(`${process.env.FLUXAPAY_BASE_URL}/api/v1/payments/checkout/${id}/status`);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('Retry-After') ?? 1) * 1000));
      continue;
    }
    const { status } = await res.json();
    if (terminal.has(status)) return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
```

</details>

<details>
<summary><strong>Python</strong></summary>

```python
import os
import time
import requests

TERMINAL = {"confirmed", "overpaid", "paid", "completed", "expired", "failed", "cancelled"}

def wait_for_payment(payment_id: str, interval: float = 4.0) -> str:
    url = f"{os.environ['FLUXAPAY_BASE_URL']}/api/v1/payments/checkout/{payment_id}/status"
    while True:
        res = requests.get(url, timeout=10)
        if res.status_code == 429:
            time.sleep(int(res.headers.get("Retry-After", "1")))
            continue
        status = res.json()["status"]
        if status in TERMINAL:
            return status
        time.sleep(interval)
```

</details>

<details>
<summary><strong>Go</strong></summary>

```go
func waitForPayment(id string) (string, error) {
	terminal := map[string]bool{"confirmed": true, "overpaid": true, "paid": true, "completed": true,
		"expired": true, "failed": true, "cancelled": true}
	url := os.Getenv("FLUXAPAY_BASE_URL") + "/api/v1/payments/checkout/" + id + "/status"
	for {
		res, err := http.Get(url)
		if err != nil {
			return "", err
		}
		if res.StatusCode == http.StatusTooManyRequests {
			wait, _ := strconv.Atoi(res.Header.Get("Retry-After"))
			res.Body.Close()
			time.Sleep(time.Duration(max(wait, 1)) * time.Second)
			continue
		}
		var body struct {
			Status string `json:"status"`
		}
		err = json.NewDecoder(res.Body).Decode(&body)
		res.Body.Close()
		if err != nil {
			return "", err
		}
		if terminal[body.Status] {
			return body.Status, nil
		}
		time.Sleep(4 * time.Second)
	}
}
```

(Imports: `encoding/json`, `net/http`, `os`, `strconv`, `time`. Requires Go 1.21+ for `max`.)

</details>

## Server-Sent Events

`GET /api/v1/payments/{id}/stream` keeps the connection open and pushes `data: {"status":"..."}`
messages as the status changes. Browsers can use `EventSource` directly:

```js
const source = new EventSource(`https://api.fluxapay.com/api/v1/payments/${paymentId}/stream`);
source.onmessage = (e) => {
  const { status } = JSON.parse(e.data);
  if (status === 'confirmed') source.close();
};
```

```bash
curl -N "$FLUXAPAY_BASE_URL/api/v1/payments/6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41/stream"
```

The hosted checkout's own `/checkout/{id}/stream` endpoint returns `404 CHECKOUT_SSE_UNAVAILABLE`; poll
`/checkout/{id}/status` there instead.
