// Command checkout_flow creates a FluxaPay payment (checkout session), prints
// the hosted checkout URL, then polls until the payment is confirmed, fails,
// expires, or the wait times out.
//
// Usage:
//
//	export FLUXAPAY_API_KEY=sk_test_...
//	go run ./examples/checkout_flow -amount 25 -email buyer@example.com
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

func main() {
	amount := flag.Float64("amount", 25, "amount to charge")
	currency := flag.String("currency", "USDC", "payment currency")
	email := flag.String("email", "buyer@example.com", "customer email")
	wait := flag.Duration("wait", 15*time.Minute, "how long to wait for the payment")
	flag.Parse()

	// Step 1: build a client from environment variables. Never hard-code
	// secret keys; keep them server-side.
	client, err := newClient()
	if err != nil {
		log.Fatal(err)
	}

	// Step 2: stop cleanly on Ctrl+C. Every SDK call takes this context, so
	// cancelling it aborts in-flight HTTP requests and the polling loop.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Step 3: create the payment. The response contains the hosted checkout
	// URL to send your customer to.
	createCtx, cancelCreate := context.WithTimeout(ctx, 30*time.Second)
	payment, err := client.Payments.Create(createCtx, fluxapay.CreatePaymentParams{
		Amount:        *amount,
		Currency:      *currency,
		CustomerEmail: *email,
		OrderID:       fmt.Sprintf("order_%d", time.Now().Unix()),
		Metadata:      map[string]interface{}{"source": "go-sdk-example"},
	})
	cancelCreate()
	if err != nil {
		exitWithAPIError("create payment", err)
	}

	fmt.Printf("Payment %s created (status: %s)\n", payment.ID, payment.Status)
	fmt.Printf("Send your customer to: %s\n", payment.CheckoutURL)
	fmt.Printf("Waiting up to %s for payment...\n", *wait)

	// Step 4: poll until a terminal status. Polling starts every 2s and backs
	// off to every 15s; transient errors (429, 5xx, network) are retried.
	final, err := client.WaitForPayment(ctx, payment.ID,
		fluxapay.WithPollInterval(2*time.Second),
		fluxapay.WithMaxPollInterval(15*time.Second),
		fluxapay.WithPollTimeout(*wait),
		fluxapay.WithOnPoll(func(p *fluxapay.Payment) {
			fmt.Printf("  %s  status=%s\n", time.Now().Format(time.Kitchen), p.Status)
		}),
	)

	// Step 5: handle each outcome explicitly.
	var statusErr *fluxapay.PaymentStatusError
	var timeoutErr *fluxapay.WaitTimeoutError
	switch {
	case err == nil:
		fmt.Printf("Payment %s succeeded with status %q. Fulfil the order.\n", final.ID, final.Status)
	case errors.As(err, &statusErr):
		// Terminal but unsuccessful: expired, failed or cancelled.
		fmt.Printf("Payment %s did not complete: %s\n", statusErr.PaymentID, statusErr.Status)
		os.Exit(2)
	case errors.As(err, &timeoutErr):
		if errors.Is(err, context.Canceled) {
			fmt.Println("Interrupted; the payment may still complete. Check it later or rely on webhooks.")
		} else {
			fmt.Printf("Gave up waiting (last status %q). Webhooks will still notify you.\n", timeoutErr.LastStatus)
		}
		os.Exit(3)
	default:
		exitWithAPIError("wait for payment", err)
	}
}

// newClient reads FLUXAPAY_API_KEY (required) and FLUXAPAY_BASE_URL (optional).
func newClient() (*fluxapay.Client, error) {
	apiKey := os.Getenv("FLUXAPAY_API_KEY")
	if apiKey == "" {
		return nil, errors.New("FLUXAPAY_API_KEY is not set (export FLUXAPAY_API_KEY=sk_test_...)")
	}
	opts := []fluxapay.Option{fluxapay.WithTimeout(20 * time.Second)}
	if baseURL := os.Getenv("FLUXAPAY_BASE_URL"); baseURL != "" {
		opts = append(opts, fluxapay.WithBaseURL(baseURL))
	}
	return fluxapay.New(apiKey, opts...), nil
}

// exitWithAPIError prints structured API errors (status, code, request ID)
// when available, which is what support needs to debug a failure.
func exitWithAPIError(step string, err error) {
	var apiErr *fluxapay.Error
	if errors.As(err, &apiErr) {
		log.Fatalf("%s failed: HTTP %d %s: %s (request id %s, retryable=%t)",
			step, apiErr.StatusCode, apiErr.Code, apiErr.Message, apiErr.RequestID, apiErr.Retryable)
	}
	log.Fatalf("%s failed: %v", step, err)
}
