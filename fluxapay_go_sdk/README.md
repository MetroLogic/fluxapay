# FluxaPay Go SDK

Go client for the [FluxaPay](https://fluxapay.com) payment gateway.

## Installation

```bash
go get github.com/MetroLogic/fluxapay/fluxapay_go_sdk
```

## Quick Start

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

## Resources

- `client.Payments` — Create, Get, GetStatus, List
- `client.Settlements` — List, Get, Summary
- `client.Webhooks` — Verify, Parse

## License

MIT
