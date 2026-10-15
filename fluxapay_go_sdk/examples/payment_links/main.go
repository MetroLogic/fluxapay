// Command payment_links creates a reusable FluxaPay payment link and lists
// your active links.
//
// Usage:
//
//	export FLUXAPAY_API_KEY=sk_test_...
//	go run ./examples/payment_links -title "Pro plan" -amount 25 -currency USD
//	go run ./examples/payment_links -title "Tip jar" -currency USD   # open amount
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

func main() {
	title := flag.String("title", "Pro plan - monthly", "link title shown on checkout")
	description := flag.String("description", "", "optional description")
	amount := flag.Float64("amount", 0, "fixed amount; 0 lets the payer choose")
	currency := flag.String("currency", "USD", "3-letter currency code")
	expiresIn := flag.Duration("expires-in", 30*24*time.Hour, "link lifetime; 0 for no expiry")
	flag.Parse()

	// Step 1: build a client from environment variables.
	apiKey := os.Getenv("FLUXAPAY_API_KEY")
	if apiKey == "" {
		log.Fatal("FLUXAPAY_API_KEY is not set (export FLUXAPAY_API_KEY=sk_test_...)")
	}
	opts := []fluxapay.Option{}
	if baseURL := os.Getenv("FLUXAPAY_BASE_URL"); baseURL != "" {
		opts = append(opts, fluxapay.WithBaseURL(baseURL))
	}
	client := fluxapay.New(apiKey, opts...)

	// Step 2: bound every call with a timeout via the context.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Step 3: describe the link. Metadata is copied onto every payment made
	// through it, which is handy for reconciling orders.
	params := &fluxapay.CreatePaymentLinkParams{
		Title:       *title,
		Description: *description,
		Amount:      *amount,
		Currency:    *currency,
		Metadata:    map[string]interface{}{"source": "go-sdk-example"},
	}
	if *expiresIn > 0 {
		params.Expiry = time.Now().Add(*expiresIn).UTC().Format(time.RFC3339)
	}

	// Step 4: create it. Client-side validation errors wrap ErrInvalidParams
	// and never reach the network; API errors are *fluxapay.Error.
	link, err := client.CreatePaymentLink(ctx, params)
	if err != nil {
		var apiErr *fluxapay.Error
		switch {
		case errors.Is(err, fluxapay.ErrInvalidParams):
			log.Fatalf("invalid link parameters: %v", err)
		case errors.As(err, &apiErr):
			log.Fatalf("API rejected the link: HTTP %d %s: %s", apiErr.StatusCode, apiErr.Code, apiErr.Message)
		default:
			log.Fatalf("create payment link: %v", err)
		}
	}

	price := "open amount"
	if link.Amount != nil {
		price = fmt.Sprintf("%.2f %s", *link.Amount, link.Currency)
	}
	fmt.Printf("Created payment link %s (%s)\n", link.ID, price)
	fmt.Printf("Share this URL: %s\n", link.ShortURL)

	// Step 5: list active links to confirm it is live.
	active := true
	list, err := client.PaymentLinks.List(ctx, fluxapay.ListPaymentLinksParams{Page: 1, Limit: 10, Active: &active})
	if err != nil {
		log.Fatalf("list payment links: %v", err)
	}
	fmt.Printf("\nYou have %d active link(s):\n", list.Meta.Total)
	for _, l := range list.Data {
		fmt.Printf("  %-14s %-30s payments=%d\n", l.Slug, l.Title, l.TotalPayments)
	}
}
