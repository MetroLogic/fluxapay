# FluxaPay Go SDK examples

Runnable programs for the common Go SDK workflows. Each is a standalone
`package main` inside the SDK module, so it builds with the standard toolchain
and no extra dependencies.

| Example | What it shows |
|---|---|
| [`checkout_flow`](checkout_flow/main.go) | Create a payment, print the checkout URL, and wait for completion with `WaitForPayment` |
| [`payment_links`](payment_links/main.go) | Create a reusable, fixed-price payment link with `CreatePaymentLink` |
| [`webhook_server`](webhook_server/main.go) | An `net/http` server that verifies webhook signatures and handles payment events |

## Setup

1. Install Go 1.21 or later.
2. From `fluxapay_go_sdk/`, check everything compiles:

   ```sh
   go build ./examples/...
   ```

3. Set the environment variables the example needs:

   | Variable | Used by | Notes |
   |---|---|---|
   | `FLUXAPAY_API_KEY` | `checkout_flow`, `payment_links` | Your secret API key. Use a test key while trying things out. |
   | `FLUXAPAY_BASE_URL` | `checkout_flow`, `payment_links` | Optional. Point at a local backend, e.g. `http://localhost:3000`. |
   | `FLUXAPAY_WEBHOOK_SECRET` | `webhook_server` | The webhook signing secret from your dashboard. |
   | `ADDR` | `webhook_server` | Optional listen address (default `:8080`). |

   ```sh
   export FLUXAPAY_API_KEY=sk_test_...
   ```

## Checkout flow

```sh
go run ./examples/checkout_flow
```

1. Creates a $49.99 payment with an idempotency key, so re-running the program
   doesn't create a second payment for the same order.
2. Prints the checkout URL; open it to pay.
3. Polls the payment, backing off from 2s to 15s, until it is paid, fails or
   expires, or 35 minutes pass. Press Ctrl-C to stop early.

## Payment links

```sh
go run ./examples/payment_links
```

Creates a one-week, $25 link and prints the `short_url` to share. Validation and
authentication failures come back as `*fluxapay.InvalidRequestError` and
`*fluxapay.AuthenticationError`.

## Webhook server

```sh
export FLUXAPAY_WEBHOOK_SECRET=whsec_...
go run ./examples/webhook_server
```

Point your webhook URL at `https://<your-host>/webhooks/fluxapay` (use a tunnel
such as `ngrok http 8080` during development). The handler:

1. reads the raw body (signatures cover the exact bytes);
2. checks `X-FluxaPay-Signature` / `X-FluxaPay-Timestamp` with
   `Webhooks.Verify`, rejecting anything older than five minutes;
3. parses the event and logs what to do for `payment.confirmed`,
   `payment.failed` and `payment.expired`;
4. replies `204 No Content` so the delivery isn't retried.

With Gin, mount the same handler with
`r.POST("/webhooks/fluxapay", gin.WrapF(func(w http.ResponseWriter, r *http.Request) { handleWebhook(w, r, secret) }))`.
