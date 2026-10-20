# Test FluxaPay webhooks locally

Use a tunnel to give FluxaPay a temporary public HTTPS URL that forwards to a
webhook receiver running on your computer. This is useful when your development
machine is behind a firewall or NAT; it does not require opening an inbound
firewall port.

The examples below listen on port `4242` and expose `POST /webhooks/fluxapay`.
They verify the FluxaPay HMAC signature before parsing or processing the event.

## 1. Start a local receiver

Choose one of the examples below. Keep the receiver running in its terminal.
Use the same port in the tunnel command in the next section.

### Node.js with Express

Requires Node.js 20 or later.

```bash
mkdir webhook-receiver
cd webhook-receiver
npm init -y
npm install express
```

Save as `server.js`:

```javascript
const crypto = require('node:crypto');
const express = require('express');

const app = express();
const port = Number(process.env.PORT || 4242);
const secret = process.env.FLUXAPAY_WEBHOOK_SECRET;
const toleranceSeconds = 300;
const processedEventIds = new Set();

if (!secret) {
  throw new Error('Set FLUXAPAY_WEBHOOK_SECRET before starting the receiver');
}

app.post(
  '/webhooks/fluxapay',
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req, res) => {
    const signature = req.get('X-FluxaPay-Signature');
    const timestamp = req.get('X-FluxaPay-Timestamp');

    if (!signature || !timestamp || !Buffer.isBuffer(req.body)) {
      return res.status(400).send('Missing signature, timestamp, or JSON body');
    }

    const timestampMs = Date.parse(timestamp);
    const ageSeconds = (Date.now() - timestampMs) / 1000;
    if (!Number.isFinite(timestampMs) || ageSeconds < 0 || ageSeconds > toleranceSeconds) {
      return res.status(401).send('Invalid or expired webhook timestamp');
    }

    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      return res.status(401).send('Invalid webhook signature');
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${req.body.toString('utf8')}`, 'utf8')
      .digest();
    const received = Buffer.from(signature, 'hex');

    if (!crypto.timingSafeEqual(received, expected)) {
      return res.status(401).send('Invalid webhook signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON body');
    }

    console.log('Verified webhook:', {
      event: event.event,
      event_id: event.event_id,
      headers: {
        'content-type': req.get('Content-Type'),
        'user-agent': req.get('User-Agent'),
        'x-fluxapay-timestamp': timestamp,
      },
    });

    if (event.event_id && processedEventIds.has(event.event_id)) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Replace this with your event-specific work. Persist event_id in a database
    // for deduplication that survives restarts.
    if (event.event_id) processedEventIds.add(event.event_id);
    console.log('Process event:', event.event);
    return res.status(200).json({ received: true });
  }
);

app.listen(port, '0.0.0.0', () => {
  console.log(`Webhook receiver listening on http://localhost:${port}/webhooks/fluxapay`);
});
```

Start the receiver with your dashboard webhook secret:

```bash
FLUXAPAY_WEBHOOK_SECRET='your_webhook_secret' node server.js
```

### Python with FastAPI

Requires Python 3.10 or later.

```bash
mkdir webhook-receiver
cd webhook-receiver
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn
```

Save as `main.py`:

```python
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request

app = FastAPI()
secret = os.environ.get("FLUXAPAY_WEBHOOK_SECRET")
tolerance_seconds = 300
processed_event_ids: set[str] = set()

if not secret:
    raise RuntimeError("Set FLUXAPAY_WEBHOOK_SECRET before starting the receiver")


@app.post("/webhooks/fluxapay")
async def receive_webhook(request: Request):
    signature = request.headers.get("x-fluxapay-signature")
    timestamp = request.headers.get("x-fluxapay-timestamp")
    if not signature or not timestamp:
        raise HTTPException(status_code=400, detail="Missing signature or timestamp")

    try:
        webhook_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        if webhook_time.tzinfo is None:
            raise ValueError("Timestamp must include a timezone")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid webhook timestamp")

    age_seconds = (datetime.now(timezone.utc) - webhook_time).total_seconds()
    if age_seconds < 0 or age_seconds > tolerance_seconds:
        raise HTTPException(status_code=401, detail="Expired or future webhook timestamp")

    raw_body = await request.body()
    expected = hmac.new(
        secret.encode("utf-8"),
        timestamp.encode("utf-8") + b"." + raw_body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    print(
        "Verified webhook:",
        {
            "event": event.get("event"),
            "event_id": event.get("event_id"),
            "content-type": request.headers.get("content-type"),
            "user-agent": request.headers.get("user-agent"),
            "x-fluxapay-timestamp": timestamp,
        },
    )

    event_id = event.get("event_id")
    if event_id and event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    # Replace this with your event-specific work. Persist event_id in a database
    # for deduplication that survives restarts.
    if event_id:
        processed_event_ids.add(event_id)
    print("Process event:", event.get("event"))
    return {"received": True}
```

Start the receiver:

```bash
FLUXAPAY_WEBHOOK_SECRET='your_webhook_secret' \
  uvicorn main:app --host 0.0.0.0 --port 4242
```

### Go with `net/http`

Requires Go 1.20 or later.

```bash
mkdir webhook-receiver
cd webhook-receiver
go mod init webhook-receiver
```

Save as `main.go`:

```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

type webhookEvent struct {
	Event   string `json:"event"`
	EventID string `json:"event_id"`
}

func main() {
	secret := os.Getenv("FLUXAPAY_WEBHOOK_SECRET")
	if secret == "" {
		log.Fatal("Set FLUXAPAY_WEBHOOK_SECRET before starting the receiver")
	}

	var mu sync.Mutex
	processedEventIDs := make(map[string]struct{})

	http.HandleFunc("/webhooks/fluxapay", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		signature := r.Header.Get("X-FluxaPay-Signature")
		timestamp := r.Header.Get("X-FluxaPay-Timestamp")
		if signature == "" || timestamp == "" {
			http.Error(w, "Missing signature or timestamp", http.StatusBadRequest)
			return
		}

		webhookTime, err := time.Parse(time.RFC3339Nano, timestamp)
		if err != nil {
			http.Error(w, "Invalid webhook timestamp", http.StatusUnauthorized)
			return
		}
		age := time.Since(webhookTime)
		if age < 0 || age > 5*time.Minute {
			http.Error(w, "Expired or future webhook timestamp", http.StatusUnauthorized)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		rawBody, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Unable to read request body", http.StatusBadRequest)
			return
		}

		received, err := hex.DecodeString(signature)
		if err != nil {
			http.Error(w, "Invalid webhook signature", http.StatusUnauthorized)
			return
		}
		mac := hmac.New(sha256.New, []byte(secret))
		_, _ = fmt.Fprintf(mac, "%s.%s", timestamp, rawBody)
		if !hmac.Equal(received, mac.Sum(nil)) {
			http.Error(w, "Invalid webhook signature", http.StatusUnauthorized)
			return
		}

		var event webhookEvent
		if err := json.Unmarshal(rawBody, &event); err != nil {
			http.Error(w, "Invalid JSON body", http.StatusBadRequest)
			return
		}

		log.Printf("Verified webhook: event=%q event_id=%q content-type=%q user-agent=%q timestamp=%q",
			event.Event, event.EventID, r.Header.Get("Content-Type"),
			r.Header.Get("User-Agent"), timestamp)

		mu.Lock()
		_, duplicate := processedEventIDs[event.EventID]
		if event.EventID != "" && !duplicate {
			processedEventIDs[event.EventID] = struct{}{}
		}
		mu.Unlock()
		if duplicate {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"received":true,"duplicate":true}`)
			return
		}

		// Replace this with your event-specific work. Persist event_id in a
		// database for deduplication that survives restarts.
		log.Printf("Process event: %s", event.Event)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"received":true}`)
	})

	log.Println("Webhook receiver listening on http://localhost:4242/webhooks/fluxapay")
	log.Fatal(http.ListenAndServe("0.0.0.0:4242", nil))
}
```

Start the receiver:

```bash
FLUXAPAY_WEBHOOK_SECRET='your_webhook_secret' go run .
```

## 2. Expose the local port

Keep the receiver running. In a second terminal, create a public tunnel to port
`4242`.

### Option A: ngrok

Install ngrok using the [official installation instructions](https://ngrok.com/download),
then connect your account once using the authtoken from your ngrok dashboard:

```bash
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
ngrok http 4242
```

ngrok prints a public forwarding URL, for example
`https://example-id.ngrok-free.app`. The tunnel forwards that HTTPS URL to your
local HTTP server. The ngrok inspector is available at `http://127.0.0.1:4040`
while the tunnel is running.

### Option B: localtunnel

With Node.js and npm installed, run:

```bash
npx localtunnel --port 4242
```

The command prints a public URL, for example `https://example-id.loca.lt`.
Leave the command running while testing. Localtunnel does not provide the same
request inspector as ngrok, so use your receiver's terminal output to inspect
requests.

## 3. Point FluxaPay at the tunnel

In the FluxaPay merchant dashboard, open **Settings > Webhooks**, add the URL
printed by your tunnel with `/webhooks/fluxapay` appended, and save it. For
example:

```text
https://example-id.ngrok-free.app/webhooks/fluxapay
```

Use the webhook secret shown for that endpoint as `FLUXAPAY_WEBHOOK_SECRET` in
the receiver. Do not use an API key or the ngrok authtoken in its place.
Send a test webhook from the dashboard and watch the receiver terminal (or the
ngrok inspector) for the request and response. Keep both the receiver and tunnel
running for the test. Prefer a test endpoint and test secret; stop the tunnel
and remove the temporary dashboard URL when you finish.

The tunnel URL is reachable from the public internet. Expose only the port you
need, keep signature verification enabled, and do not use a local receiver with
production credentials or sensitive data.

## Inspect headers and verify signatures

Useful request headers include:

| Header | Purpose |
| --- | --- |
| `Content-Type` | Usually `application/json` |
| `X-FluxaPay-Signature` | Hex-encoded HMAC-SHA256 signature |
| `X-FluxaPay-Timestamp` | ISO 8601 timestamp included in the signature |
| `User-Agent` | Identifies the sending client when present |

The signature is calculated as:

```text
hex(HMAC-SHA256(webhook_secret, timestamp + "." + raw_request_body))
```

Use the exact request body bytes as received. Parsing JSON and serializing it
again can change whitespace, key order, or number formatting and will invalidate
the signature. Validate that the timestamp is recent (the examples allow five
minutes and reject future timestamps), then compare the signature in constant
time. Never log the webhook secret or full signature in shared logs.

The examples log selected headers and the event name and ID, not the full body.
To inspect all incoming headers during local debugging, use the tunnel's
request-inspection UI where available or temporarily log header names and
non-secret values in your local receiver. Avoid logging authorization headers,
secrets, or payment/customer data.

## Retry and duplicate-delivery behavior

Return a `2xx` response only after the event is safely accepted. If processing
may take a while, validate the signature, persist or enqueue the event, and
return `200` promptly; finish slower work asynchronously. A non-`2xx` response
or a timeout is a failed delivery and may be retried. FluxaPay's backend uses
exponential backoff and caps automatic retries at three; exact scheduling can
depend on backend configuration. See the
[webhooks guide](../../fluxapay_backend/docs/webhooks.md#retry-behavior) for
delivery details.

Retries can deliver the same event more than once. Use the stable `event_id` as
an idempotency key and store processed IDs durably in real applications. The
in-memory sets in the examples only help during a single local process and lose
their contents when restarted.

To exercise retry handling locally, temporarily make the handler return a
`500` response or pause it until the sender times out. Restore a successful
`200` response, then use the dashboard's delivery log or retry action to test
another attempt. Do not assume that a retry changes the event ID or makes it
safe to process the operation twice.

## Troubleshooting

### Signature mismatch (`401`)

- Confirm you copied the secret for this exact webhook endpoint.
- Verify against the unmodified raw body, before JSON parsing or middleware
  transforms it.
- Sign `timestamp + "." + raw_body`, using the exact value of
  `X-FluxaPay-Timestamp`; do not add spaces or a newline.
- Decode/compare the signature as hex and ensure the server clock is correct.
- Check that the test event is recent; the sample code rejects timestamps older
  than five minutes and any timestamp in the future.

### Tunnel returns `502`, `503`, or cannot connect

- Make sure the receiver is still running and listening on port `4242`.
- Check the local URL directly, for example
  `curl -i -X POST -H 'Content-Type: application/json' --data '{}' http://localhost:4242/webhooks/fluxapay`
  (a `400` or `401` is expected without signature headers and confirms the
  server is reachable).
- Confirm the tunnel command targets the same port and that its process has not
  exited. Restart it if the public URL has changed, then update the dashboard.
- Check local firewall or endpoint-security software if the tunnel cannot reach
  the local listener.

### Delivery times out

- Return a response quickly; avoid waiting for a long-running job before
  acknowledging a verified event.
- Check that the handler reaches a response on every code path. A tunnel
  connection alone does not mean the application completed the request.
- Inspect the delivery log for the HTTP status, response, and attempt time.
  Timeouts or non-`2xx` responses can lead to retries.

### SSL or certificate errors

- Configure the webhook URL with the tunnel's public `https://` URL, not
  `http://localhost` or the tunnel's local inspector.
- The tunnel terminates public HTTPS and forwards to the local HTTP receiver;
  local TLS is not required for this setup.
- If using a custom or self-hosted tunnel, install a valid certificate and
  correct certificate chain. Do not disable certificate verification as a
  workaround.

### No request appears in the receiver

- Confirm the dashboard URL includes `/webhooks/fluxapay` and uses the current
  tunnel URL.
- Send a test webhook from the dashboard and check the tunnel inspector before
  debugging the application.
- Keep the receiver and tunnel terminals open; both processes must be running.

For webhook event payloads, signature details, and delivery logs, see the
[backend webhooks documentation](../../fluxapay_backend/docs/webhooks.md) and
[signature verification guide](../../fluxapay_backend/docs/WEBHOOK_SIGNATURE_VERIFICATION.md).
