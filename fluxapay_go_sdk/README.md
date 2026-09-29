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
