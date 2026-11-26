// payment_links creates a reusable payment link and prints its shareable URL.
//
//	FLUXAPAY_API_KEY=sk_test_... go run ./examples/payment_links
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

func main() {
	// 1. Client from the environment (FLUXAPAY_BASE_URL is optional).
	apiKey := os.Getenv("FLUXAPAY_API_KEY")
	if apiKey == "" {
		log.Fatal("set FLUXAPAY_API_KEY")
	}
	var opts []fluxapay.Option
	if base := os.Getenv("FLUXAPAY_BASE_URL"); base != "" {
		opts = append(opts, fluxapay.WithBaseURL(base))
	}
	client := fluxapay.New(apiKey, opts...)

	// 2. Bound the whole call with a timeout.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// 3. A fixed-price link that expires in a week. Leave Amount nil for a
	//    pay-what-you-want link.
	price := 25.00
	link, err := client.CreatePaymentLink(ctx, &fluxapay.CreatePaymentLinkParams{
		Title:       "Workshop ticket",
		Description: "One seat at the December workshop",
		Amount:      &price,
		Currency:    "USD",
		RedirectURL: "https://example.com/thanks",
		Expiry:      time.Now().Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339),
		Metadata:    map[string]interface{}{"campaign": "december"},
	}, fluxapay.WithIdempotencyKey("workshop-december"))

	// 4. Typed errors tell you what went wrong.
	var invalid *fluxapay.InvalidRequestError
	var auth *fluxapay.AuthenticationError
	switch {
	case errors.As(err, &invalid):
		log.Fatalf("the backend rejected the link: %s", invalid.Message)
	case errors.As(err, &auth):
		log.Fatal("check FLUXAPAY_API_KEY")
	case err != nil:
		log.Fatalf("create payment link: %v", err)
	}

	fmt.Printf("Payment link %s (%s)\nShare it: %s\n", link.ID, link.Slug, link.ShortURL)
}
