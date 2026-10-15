# FluxaPay Go SDK

Go client for the [FluxaPay](https://fluxapay.com) payment gateway.

## Installation

```bash
go get github.com/MetroLogic/fluxapay/fluxapay_go_sdk
```

## Quick Start

By default, the HTTP client has a 30-second timeout. You can configure this using the `WithTimeout` option.

```go
package main

import (
    "context"
    "fmt"
    fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

func main() {
    client := fluxapay.New("sk_live_...")

    payment, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
        Amount:        49.99,
        Currency:      "USD",
        CustomerEmail: "buyer@example.com",
        OrderID:       "order_123",
    })
    if err != nil {
        panic(err)
    }
    fmt.Println(payment.CheckoutURL)
}
```

## Webhook Verification

```go
valid := client.Webhooks.Verify(rawBody, signature, timestamp, "whsec_...", 300)
if !valid {
    http.Error(w, "invalid signature", http.StatusUnauthorized)
    return
}
event, _ := client.Webhooks.Parse(rawBody)
```

## Payment Links

```go
link, err := client.CreatePaymentLink(ctx, &fluxapay.CreatePaymentLinkParams{
    Title:    "Pro plan - monthly",
    Amount:   25, // omit (0) for an open-amount link
    Currency: "USD",
    Expiry:   time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
})
if errors.Is(err, fluxapay.ErrInvalidParams) {
    // rejected client-side, no request was sent
}
fmt.Println(link.ShortURL)

// Also: client.PaymentLinks.Get(ctx, id) and client.PaymentLinks.List(ctx, params)
```

## Waiting for a Payment

`WaitForPayment` polls until the payment reaches a terminal status, with
exponential backoff and full `context` support:

```go
ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
defer cancel()

payment, err := client.WaitForPayment(ctx, paymentID,
    fluxapay.WithPollInterval(2*time.Second),     // first delay (default 2s)
    fluxapay.WithMaxPollInterval(15*time.Second), // backoff cap (default 30s)
)
var statusErr *fluxapay.PaymentStatusError
var timeoutErr *fluxapay.WaitTimeoutError
switch {
case err == nil:
    // confirmed / paid / completed / overpaid
case errors.As(err, &statusErr):
    // expired / failed / cancelled; statusErr.Payment has the final state
case errors.As(err, &timeoutErr):
    // context deadline, cancellation or WithPollTimeout
}
```

Transient errors (429, 502–504, network failures) are retried while polling;
other API errors are returned immediately. Other options: `WithPollBackoff`,
`WithPollTimeout`, `WithSuccessStatuses`, `WithFailureStatuses`, `WithOnPoll`.

## Examples

Runnable programs for a checkout flow, a webhook server and payment links are in
[`examples/`](./examples/README.md):

```bash
export FLUXAPAY_API_KEY=sk_test_...
go run ./examples/checkout_flow
```

## Customers

List and retrieve customer records for the authenticated merchant.

```go
// List customers, filtering by email search.
page := 1
list, err := client.Customers.List(context.Background(), fluxapay.ListCustomersParams{
    Page:   page,
    Limit:  20,
    Search: "ada",
})
if err != nil {
    panic(err)
}
fmt.Printf("found %d customers\n", list.Total)
for _, c := range list.Customers {
    fmt.Println(c.ID, c.Email)
}

// Retrieve a single customer by ID.
customer, err := client.Customers.Get(context.Background(), "cus_123")
if err != nil {
    panic(err)
}
fmt.Println(customer.Name, customer.StellarAddress)
```

## Resources

- `client.Payments` — Create, Get, GetStatus, List
- `client.Settlements` — List, Get, Summary
- `client.Invoices` — Create, Get, List
- `client.Refunds` — Create, Get, List
- `client.Webhooks` — Verify, Parse

## License

MIT
