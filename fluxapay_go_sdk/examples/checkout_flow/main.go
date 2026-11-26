// checkout_flow creates a payment, prints its checkout URL, and waits until the
// payer completes (or the payment fails / expires).
//
//	FLUXAPAY_API_KEY=sk_test_... go run ./examples/checkout_flow
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

func main() {
	// 1. Build a client from the environment. FLUXAPAY_BASE_URL is optional and
	//    lets you point at a local or sandbox backend.
	apiKey := os.Getenv("FLUXAPAY_API_KEY")
	if apiKey == "" {
		log.Fatal("set FLUXAPAY_API_KEY")
	}
	var opts []fluxapay.Option
	if base := os.Getenv("FLUXAPAY_BASE_URL"); base != "" {
		opts = append(opts, fluxapay.WithBaseURL(base))
	}
	client := fluxapay.New(apiKey, opts...)

	// 2. Stop cleanly on Ctrl-C: every SDK call takes this context.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	// 3. Create the payment. The idempotency key makes a retried create safe:
	//    the backend returns the same payment instead of charging twice.
	payment, err := client.Payments.Create(ctx, fluxapay.CreatePaymentParams{
		Amount:           49.99,
		Currency:         "USD",
		CustomerEmail:    "buyer@example.com",
		OrderID:          "order-1001",
		ExpiresInMinutes: 30,
	}, fluxapay.WithIdempotencyKey("order-1001"))
	if err != nil {
		log.Fatalf("create payment: %v", err)
	}
	fmt.Printf("Payment %s created. Send the payer to:\n  %s\n", payment.ID, payment.CheckoutURL)

	// 4. Wait for a final status. Polling starts every 2s and backs off to 15s;
	//    retryable errors (429, 502-504) are retried automatically.
	final, err := client.WaitForPayment(ctx, payment.ID,
		fluxapay.WithPollInterval(2*time.Second),
		fluxapay.WithPollBackoff(1.5, 15*time.Second),
		fluxapay.WithPollTimeout(35*time.Minute),
		fluxapay.WithOnPoll(func(p *fluxapay.Payment) { fmt.Printf("  status: %s\n", p.Status) }),
	)

	// 5. Handle each outcome explicitly.
	switch {
	case err == nil:
		fmt.Printf("Paid! %s is %s.\n", final.ID, final.Status)
	case errors.Is(err, fluxapay.ErrPaymentNotSuccessful):
		fmt.Printf("Payment finished without paying: %v\n", err)
		os.Exit(1)
	case errors.Is(err, context.DeadlineExceeded):
		fmt.Println("Gave up waiting; the payment is still open.")
		os.Exit(1)
	case errors.Is(err, context.Canceled):
		fmt.Println("Interrupted.")
	default:
		log.Fatalf("polling failed: %v", err)
	}
}
