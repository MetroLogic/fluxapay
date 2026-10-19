// Package fluxapay_test demonstrates how to use the FluxaPay mock server helpers
// for integration testing merchant backend code without hitting live API servers.
//
// These tests show:
//   - Creating payments against the mock server
//   - Polling for status changes
//   - Testing error scenarios (invalid API key, insufficient funds)
//   - Using the mock server as a drop-in replacement for the real API in CI/CD
package fluxapay_test

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

// ── MockServer construction ───────────────────────────────────────────────────

func TestMockServerDefaultConfig(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{})
	defer srv.Close()

	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	// Create a payment with no pre-seeded payments; mock returns a generated one.
	payment, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount:        19.99,
		Currency:      "USD",
		CustomerEmail: "test@example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if payment.ID == "" {
		t.Error("expected non-empty payment ID from default mock")
	}
	if payment.Amount != 19.99 {
		t.Errorf("expected amount 19.99, got %f", payment.Amount)
	}
}

// ── Payment creation ──────────────────────────────────────────────────────────

func TestMockServerCreatePayment(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		Payments: []fluxapay.MockPayment{
			{
				ID:             "pay_test_001",
				Amount:         49.99,
				Currency:       "USD",
				Status:         "pending",
				CheckoutURL:    "https://pay.fluxapay.com/pay_test_001",
				StellarAddress: "GABC123STELLARADDRESS",
				CustomerEmail:  "buyer@example.com",
				CreatedAt:      "2024-06-01T10:00:00Z",
				ExpiresAt:      "2024-06-01T10:30:00Z",
			},
		},
	})
	defer srv.Close()

	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	payment, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount:        49.99,
		Currency:      "USD",
		CustomerEmail: "buyer@example.com",
		OrderID:       "order_123",
	})
	if err != nil {
		t.Fatalf("create payment: %v", err)
	}

	if payment.ID != "pay_test_001" {
		t.Errorf("want pay_test_001, got %s", payment.ID)
	}
	if payment.Status != "pending" {
		t.Errorf("want pending, got %s", payment.Status)
	}
	if payment.CheckoutURL != "https://pay.fluxapay.com/pay_test_001" {
		t.Errorf("unexpected checkout URL: %s", payment.CheckoutURL)
	}
	if payment.StellarAddress == "" {
		t.Error("expected Stellar deposit address")
	}
}

// ── Payment polling / status transitions ─────────────────────────────────────

func TestMockServerPaymentPolling(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		Payments: []fluxapay.MockPayment{
			{
				ID:            "pay_poll_001",
				Amount:        25.00,
				Currency:      "USD",
				Status:        "pending",
				CheckoutURL:   "https://pay.fluxapay.com/pay_poll_001",
				CustomerEmail: "poller@example.com",
				CreatedAt:     "2024-06-01T10:00:00Z",
				ExpiresAt:     "2024-06-01T10:30:00Z",
			},
		},
	})
	defer srv.Close()

	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	// Fetch initial status — should be "pending".
	status, err := client.Payments.GetStatus(context.Background(), "pay_poll_001")
	if err != nil {
		t.Fatalf("initial GetStatus: %v", err)
	}
	if status.Status != "pending" {
		t.Errorf("want pending, got %s", status.Status)
	}

	// Simulate on-chain confirmation: update the mock payment status.
	if !srv.UpdatePaymentStatus("pay_poll_001", "confirmed") {
		t.Fatal("UpdatePaymentStatus returned false — payment not found in mock")
	}

	// Fetch updated status — should now be "confirmed".
	status, err = client.Payments.GetStatus(context.Background(), "pay_poll_001")
	if err != nil {
		t.Fatalf("confirmed GetStatus: %v", err)
	}
	if status.Status != "confirmed" {
		t.Errorf("want confirmed, got %s", status.Status)
	}

	// Simulate settlement.
	srv.UpdatePaymentStatus("pay_poll_001", "settled")
	status, err = client.Payments.GetStatus(context.Background(), "pay_poll_001")
	if err != nil {
		t.Fatalf("settled GetStatus: %v", err)
	}
	if status.Status != "settled" {
		t.Errorf("want settled, got %s", status.Status)
	}
}

// ── Error scenarios ───────────────────────────────────────────────────────────

func TestMockServerInvalidAPIKey(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		RequireAPIKey: true,
		APIKey:        "sk_live_valid_key",
	})
	defer srv.Close()

	// Client with wrong API key.
	client := fluxapay.New("sk_live_WRONG_KEY", fluxapay.WithBaseURL(srv.URL))

	_, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount:        10.00,
		Currency:      "USD",
		CustomerEmail: "user@example.com",
	})
	if err == nil {
		t.Fatal("expected error for invalid API key, got nil")
	}

	var apiErr *fluxapay.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *fluxapay.APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", apiErr.StatusCode)
	}
}

func TestMockServerValidAPIKey(t *testing.T) {
	const apiKey = "sk_live_valid_key"
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		RequireAPIKey: true,
		APIKey:        apiKey,
		Payments: []fluxapay.MockPayment{
			{ID: "pay_auth_ok", Amount: 10.00, Currency: "USD", Status: "pending",
				CustomerEmail: "u@example.com", CreatedAt: "2024-01-01T00:00:00Z", ExpiresAt: "2024-01-01T00:30:00Z"},
		},
	})
	defer srv.Close()

	client := fluxapay.New(apiKey, fluxapay.WithBaseURL(srv.URL))
	payment, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount: 10.00, Currency: "USD", CustomerEmail: "u@example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error with valid API key: %v", err)
	}
	if payment.ID == "" {
		t.Error("expected valid payment response")
	}
}

func TestMockServerErrorOnCreate(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		ErrorOnCreate: &fluxapay.MockError{
			StatusCode: 402,
			Message:    "Insufficient funds",
			Code:       "INSUFFICIENT_FUNDS",
		},
	})
	defer srv.Close()

	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	_, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount:        999999.00,
		Currency:      "USD",
		CustomerEmail: "merchant@example.com",
	})
	if err == nil {
		t.Fatal("expected INSUFFICIENT_FUNDS error, got nil")
	}

	apiErr, ok := err.(*fluxapay.Error)
	if !ok {
		t.Fatalf("expected *fluxapay.Error, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 402 {
		t.Errorf("want 402, got %d", apiErr.StatusCode)
	}
	if apiErr.Code != "INSUFFICIENT_FUNDS" {
		t.Errorf("want INSUFFICIENT_FUNDS, got %s", apiErr.Code)
	}
}

func TestMockServerErrorOnGet(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		ErrorOnGet: &fluxapay.MockError{
			StatusCode: 404,
			Message:    "payment not found",
			Code:       "NOT_FOUND",
		},
	})
	defer srv.Close()

	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	_, err := client.Payments.Get(context.Background(), "pay_nonexistent")
	if err == nil {
		t.Fatal("expected NOT_FOUND error, got nil")
	}

	apiErr, ok := err.(*fluxapay.Error)
	if !ok {
		t.Fatalf("expected *fluxapay.Error, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 404 {
		t.Errorf("want 404, got %d", apiErr.StatusCode)
	}
}

func TestMockServerPaymentNotFoundByID(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		Payments: []fluxapay.MockPayment{
			{ID: "pay_existing", Amount: 50.0, Currency: "USD", Status: "pending",
				CustomerEmail: "x@x.com", CreatedAt: "2024-01-01T00:00:00Z", ExpiresAt: "2024-01-01T00:30:00Z"},
		},
	})
	defer srv.Close()

	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	// Get an existing payment — success.
	p, err := client.Payments.Get(context.Background(), "pay_existing")
	if err != nil {
		t.Fatalf("expected payment, got error: %v", err)
	}
	if p.ID != "pay_existing" {
		t.Errorf("unexpected ID: %s", p.ID)
	}

	// Get a non-existing payment — 404.
	_, err = client.Payments.Get(context.Background(), "pay_ghost")
	if err == nil {
		t.Fatal("expected 404 error, got nil")
	}
	apiErr, ok := err.(*fluxapay.Error)
	if !ok || apiErr.StatusCode != 404 {
		t.Errorf("expected 404 error, got: %v", err)
	}
}

// ── Dynamic mock updates ──────────────────────────────────────────────────────

func TestMockServerAddPaymentDynamically(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{})
	defer srv.Close()

	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	// Not yet seeded — should 404.
	_, err := client.Payments.Get(context.Background(), "pay_dynamic")
	if err == nil {
		t.Fatal("expected 404 before payment is added")
	}

	// Seed the payment dynamically.
	srv.AddPayment(fluxapay.MockPayment{
		ID:            "pay_dynamic",
		Amount:        15.00,
		Currency:      "EUR",
		Status:        "pending",
		CustomerEmail: "dynamic@example.com",
		CreatedAt:     "2024-06-01T12:00:00Z",
		ExpiresAt:     "2024-06-01T12:30:00Z",
	})

	payment, err := client.Payments.Get(context.Background(), "pay_dynamic")
	if err != nil {
		t.Fatalf("unexpected error after dynamic add: %v", err)
	}
	if payment.ID != "pay_dynamic" {
		t.Errorf("unexpected payment ID: %s", payment.ID)
	}
	if payment.Currency != "EUR" {
		t.Errorf("unexpected currency: %s", payment.Currency)
	}
}

func TestMockServerSetErrorOnCreateDynamically(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		Payments: []fluxapay.MockPayment{
			{ID: "pay_ok", Amount: 10.00, Currency: "USD", Status: "pending",
				CustomerEmail: "ok@example.com", CreatedAt: "2024-01-01T00:00:00Z", ExpiresAt: "2024-01-01T00:30:00Z"},
		},
	})
	defer srv.Close()

	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	// First request succeeds.
	_, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount: 10.00, Currency: "USD", CustomerEmail: "ok@example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Configure error and verify second request fails.
	srv.SetErrorOnCreate(&fluxapay.MockError{StatusCode: 503, Message: "service unavailable", Code: "SERVICE_UNAVAILABLE"})
	_, err = client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount: 10.00, Currency: "USD", CustomerEmail: "ok@example.com",
	})
	if err == nil {
		t.Fatal("expected error after SetErrorOnCreate, got nil")
	}

	apiErr, ok := err.(*fluxapay.Error)
	if !ok || apiErr.StatusCode != 503 {
		t.Errorf("expected 503 error, got: %v", err)
	}

	// Clear the error.
	srv.SetErrorOnCreate(nil)
	_, err = client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount: 10.00, Currency: "USD", CustomerEmail: "ok@example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error after clearing error: %v", err)
	}
}

// ── Example: merchant backend integration test ────────────────────────────────

// TestMerchantCheckoutFlow simulates a complete merchant checkout integration test:
// 1. Merchant backend creates a payment via the SDK.
// 2. Merchant backend polls for status.
// 3. Mock server simulates on-chain confirmation.
// 4. Merchant backend detects "confirmed" and fulfills the order.
//
// This demonstrates how to use MockServer as a drop-in replacement for the
// real FluxaPay API in a merchant backend integration test.
func TestMerchantCheckoutFlow(t *testing.T) {
	// Seed the mock with a pending payment.
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		Payments: []fluxapay.MockPayment{
			{
				ID:             "pay_checkout_001",
				Amount:         99.99,
				Currency:       "USD",
				Status:         "pending",
				CheckoutURL:    "https://pay.fluxapay.com/pay_checkout_001",
				StellarAddress: "GABC_MERCHANT_DEPOSIT",
				CustomerEmail:  "shopper@store.example.com",
				CreatedAt:      "2024-06-01T00:00:00Z",
				ExpiresAt:      "2024-06-01T00:30:00Z",
			},
		},
	})
	defer srv.Close()

	// SDK client pointing at mock.
	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	// Step 1: Merchant backend creates the payment.
	payment, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount:        99.99,
		Currency:      "USD",
		CustomerEmail: "shopper@store.example.com",
		OrderID:       "store_order_42",
	})
	if err != nil {
		t.Fatalf("step 1 — create payment: %v", err)
	}

	if payment.CheckoutURL == "" {
		t.Error("step 1 — expected a checkout URL to redirect the customer to")
	}

	// Step 2: Poll for status (initially pending).
	status, err := client.Payments.GetStatus(context.Background(), payment.ID)
	if err != nil {
		t.Fatalf("step 2 — initial poll: %v", err)
	}
	if status.Status != "pending" {
		t.Errorf("step 2 — want pending, got %s", status.Status)
	}

	// Step 3: Simulate FluxaPay confirming the payment on-chain.
	srv.UpdatePaymentStatus(payment.ID, "confirmed")

	// Step 4: Poll again and detect confirmation.
	maxAttempts := 5
	var confirmed bool
	for i := 0; i < maxAttempts; i++ {
		s, err := client.Payments.GetStatus(context.Background(), payment.ID)
		if err != nil {
			t.Fatalf("step 4 — poll attempt %d: %v", i+1, err)
		}
		if s.Status == "confirmed" {
			confirmed = true
			break
		}
		time.Sleep(1 * time.Millisecond) // Back-off in a real implementation
	}

	if !confirmed {
		t.Error("step 4 — payment was never confirmed within polling attempts")
	}

	// Step 5: Merchant fulfills the order upon confirmation.
	// (In a real test, this would assert order fulfillment logic.)
	t.Log("order_42 fulfilled — payment confirmed on-chain via mock FluxaPay server")
}

// ── Mock server list payments ─────────────────────────────────────────────────

func TestMockServerListPayments(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		Payments: []fluxapay.MockPayment{
			{ID: "pay_1", Amount: 10.00, Currency: "USD", Status: "confirmed",
				CustomerEmail: "a@example.com", CreatedAt: "2024-01-01T00:00:00Z", ExpiresAt: "2024-01-01T01:00:00Z"},
			{ID: "pay_2", Amount: 20.00, Currency: "USD", Status: "settled",
				CustomerEmail: "b@example.com", CreatedAt: "2024-01-02T00:00:00Z", ExpiresAt: "2024-01-02T01:00:00Z"},
		},
	})
	defer srv.Close()

	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))

	list, err := client.Payments.List(context.Background(), fluxapay.ListPaymentsParams{Page: 1, Limit: 10})
	if err != nil {
		t.Fatalf("list payments: %v", err)
	}

	if list.Total != 2 {
		t.Errorf("expected total 2, got %d", list.Total)
	}
	if len(list.Payments) != 2 {
		t.Errorf("expected 2 payments, got %d", len(list.Payments))
	}
}

// ── GetPayment helper ─────────────────────────────────────────────────────────

func TestMockServerGetPaymentHelper(t *testing.T) {
	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
		Payments: []fluxapay.MockPayment{
			{ID: "pay_get_test", Amount: 5.00, Currency: "USD", Status: "pending",
				CustomerEmail: "x@x.com", CreatedAt: "2024-01-01T00:00:00Z", ExpiresAt: "2024-01-01T00:30:00Z"},
		},
	})
	defer srv.Close()

	p, ok := srv.GetPayment("pay_get_test")
	if !ok {
		t.Fatal("GetPayment returned not ok for seeded payment")
	}
	if p.ID != "pay_get_test" {
		t.Errorf("unexpected ID: %s", p.ID)
	}

	_, ok = srv.GetPayment("pay_nonexistent")
	if ok {
		t.Error("GetPayment should return false for non-existent payment")
	}
}
