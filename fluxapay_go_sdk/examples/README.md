# FluxaPay Go SDK examples

Three runnable programs that cover the most common integration tasks. Each
one is a standalone `package main` inside the SDK module, so it builds with the
standard Go toolchain and needs no extra dependencies.

| Example | What it shows |
|---------|---------------|
| [`checkout_flow`](./checkout_flow/main.go) | Create a payment, send the customer to `checkout_url`, poll until it completes with `WaitForPayment` |
| [`webhook_server`](./webhook_server/main.go) | `net/http` server that verifies webhook signatures and dispatches on event type |
| [`payment_links`](./payment_links/main.go) | Create a reusable payment link (fixed or open amount) and list active links |

## 1. Prerequisites

- Go 1.21 or newer (`go version`)
- A FluxaPay account with a **test** API key (`sk_test_...`) and, for webhooks,
  your webhook secret (`whsec_...`). Use test keys while you experiment.

## 2. Set environment variables

The examples read credentials from the environment, never from source code.

| Variable | Used by | Required | Description |
|----------|---------|----------|-------------|
| `FLUXAPAY_API_KEY` | `checkout_flow`, `payment_links` | yes | Your secret API key, e.g. `sk_test_...` |
| `FLUXAPAY_BASE_URL` | `checkout_flow`, `payment_links` | no | Override the API URL, e.g. `http://localhost:3000` for a local backend |
| `FLUXAPAY_WEBHOOK_SECRET` | `webhook_server` | yes | Secret used to verify `X-FluxaPay-Signature` |
| `PORT` | `webhook_server` | no | Listen port (default `8080`) |

macOS / Linux:

```bash
export FLUXAPAY_API_KEY="sk_test_xxxxxxxxxxxxxxxx"
export FLUXAPAY_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxxxxx"
# Optional, when running the backend locally:
export FLUXAPAY_BASE_URL="http://localhost:3000"
```

Windows (PowerShell):

```powershell
$env:FLUXAPAY_API_KEY = "sk_test_xxxxxxxxxxxxxxxx"
$env:FLUXAPAY_WEBHOOK_SECRET = "whsec_xxxxxxxxxxxxxxxx"
```

## 3. Run the examples

Run the commands from the `fluxapay_go_sdk` directory (the module root):

```bash
cd fluxapay_go_sdk
```

### Checkout flow

```bash
go run ./examples/checkout_flow -amount 25 -email buyer@example.com -wait 10m
```

1. Creates a payment and prints its `checkout_url`.
2. Open the URL and pay with a Stellar testnet wallet (or let it expire).
3. The program polls with exponential backoff (2s up to 15s) and exits with:
   - `0` when the payment succeeds (`confirmed`, `paid`, `completed`, `overpaid`)
   - `2` when it ends `expired`, `failed` or `cancelled`
   - `3` when the wait times out or you press Ctrl+C

### Webhook server

```bash
go run ./examples/webhook_server
```

1. Expose the server publicly, e.g. `ngrok http 8080`, and set your merchant
   webhook URL to `https://<your-tunnel>/webhooks/fluxapay`.
2. Trigger a test event from the dashboard, or create a payment with the
   checkout example.
3. Valid deliveries log the event; tampered or stale ones get `400`.

The handler reads the **raw** body (signatures cover the exact bytes),
calls `client.Webhooks.Verify` with a 300-second replay window, then parses the
event. Respond with `2xx` quickly and do slow work asynchronously.

### Payment links

```bash
# Fixed price, expires in 30 days (default)
go run ./examples/payment_links -title "Pro plan" -amount 25 -currency USD

# Open amount (payer chooses), never expires
go run ./examples/payment_links -title "Tip jar" -currency USD -expires-in 0
```

Prints the shareable `short_url` and lists your active links.

## 4. Build everything

```bash
go build ./...      # compiles the SDK and all examples
go vet ./...
```

## Using Gin instead of net/http

The verification logic is identical in any framework. Read the raw body, then
call `Verify`:

```go
r.POST("/webhooks/fluxapay", func(c *gin.Context) {
	raw, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20))
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	ok := client.Webhooks.Verify(string(raw),
		c.GetHeader("X-FluxaPay-Signature"),
		c.GetHeader("X-FluxaPay-Timestamp"),
		os.Getenv("FLUXAPAY_WEBHOOK_SECRET"), 300)
	if !ok {
		c.Status(http.StatusBadRequest)
		return
	}
	event, err := client.Webhooks.Parse(string(raw))
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	log.Println("received", event.Event)
	c.Status(http.StatusOK)
})
```

Don't use `c.ShouldBindJSON` before verifying: it consumes and re-encodes the body.

## Error handling cheat sheet

| Error | Meaning | Check with |
|-------|---------|------------|
| `*fluxapay.Error` | API returned non-2xx; has `StatusCode`, `Code`, `RequestID`, `Retryable` | `errors.As(err, &apiErr)` |
| `fluxapay.ErrInvalidParams` | Client-side validation failed; no request was sent | `errors.Is(err, fluxapay.ErrInvalidParams)` |
| `*fluxapay.PaymentStatusError` | `WaitForPayment` saw a terminal failure status | `errors.As(err, &statusErr)` or `errors.Is(err, fluxapay.ErrPaymentNotSuccessful)` |
| `*fluxapay.WaitTimeoutError` | `WaitForPayment` ran out of time or was cancelled | `errors.As(err, &timeoutErr)`, `errors.Is(err, context.DeadlineExceeded)` |
