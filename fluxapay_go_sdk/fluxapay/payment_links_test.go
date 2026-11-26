package fluxapay_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

func TestCreatePaymentLink(t *testing.T) {
	amount := 49.99
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/payment-links" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk_live_test" {
			t.Errorf("Authorization = %q", got)
		}
		if got := r.Header.Get("Idempotency-Key"); got != "link-1" {
			t.Errorf("Idempotency-Key = %q", got)
		}
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["title"] != "T-shirt" || body["currency"] != "USD" || body["amount"] != 49.99 {
			t.Errorf("unexpected body %v", body)
		}
		if _, ok := body["redirect_url"]; ok {
			t.Errorf("empty redirect_url should be omitted: %v", body)
		}
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"id": "pl_1", "slug": "abc123", "title": "T-shirt", "amount": 49.99,
			"currency": "USD", "active": true, "short_url": "https://pay.fluxapay.com/pay/abc123",
			"total_payments": 0, "total_volume": 0, "created_at": "2026-11-25T00:00:00Z",
		})
	})

	link, err := client.CreatePaymentLink(context.Background(), &fluxapay.CreatePaymentLinkParams{
		Title: "T-shirt", Amount: &amount, Currency: "USD",
	}, fluxapay.WithIdempotencyKey("link-1"))
	if err != nil {
		t.Fatalf("CreatePaymentLink: %v", err)
	}
	if link.ID != "pl_1" || link.ShortURL != "https://pay.fluxapay.com/pay/abc123" || !link.Active {
		t.Errorf("unexpected link %+v", link)
	}
	if link.Amount == nil || *link.Amount != 49.99 {
		t.Errorf("amount = %v", link.Amount)
	}
}

func TestCreatePaymentLinkErrors(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"code": "VALIDATION_ERROR", "message": "title is required"})
	})

	_, err := client.CreatePaymentLink(context.Background(), &fluxapay.CreatePaymentLinkParams{Currency: "USD"})
	var invalid *fluxapay.InvalidRequestError
	if !errors.As(err, &invalid) || invalid.Message != "title is required" {
		t.Fatalf("expected InvalidRequestError, got %v", err)
	}

	if _, err := client.CreatePaymentLink(context.Background(), nil); !errors.Is(err, fluxapay.ErrMissingParams) {
		t.Fatalf("nil params: got %v", err)
	}
}

func TestCreatePaymentLinkHonoursContext(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	})
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	_, err := client.CreatePaymentLink(ctx, &fluxapay.CreatePaymentLinkParams{Title: "x", Currency: "USD"})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline exceeded, got %v", err)
	}
}

// statusServer serves GET /api/payments/{id} with the statuses in order, then
// repeats the last one. A status of "429" or "500" returns that HTTP error.
func statusServer(t *testing.T, statuses ...string) (*fluxapay.Client, *int32) {
	t.Helper()
	var calls int32
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/payments/pay_123" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		n := int(atomic.AddInt32(&calls, 1)) - 1
		if n >= len(statuses) {
			n = len(statuses) - 1
		}
		switch statuses[n] {
		case "429":
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"message": "slow down"})
		case "500":
			writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "boom"})
		default:
			p := paymentFixture
			p.Status = statuses[n]
			writeJSON(w, http.StatusOK, p)
		}
	})
	return client, &calls
}

func fastPolling() []fluxapay.PollOption {
	return []fluxapay.PollOption{fluxapay.WithPollInterval(time.Millisecond), fluxapay.WithPollBackoff(2, 4*time.Millisecond)}
}

func TestWaitForPaymentSucceeds(t *testing.T) {
	client, calls := statusServer(t, "pending", "429", "partially_paid", "confirmed")
	var seen []string
	opts := append(fastPolling(), fluxapay.WithOnPoll(func(p *fluxapay.Payment) { seen = append(seen, p.Status) }))

	payment, err := client.WaitForPayment(context.Background(), "pay_123", opts...)
	if err != nil {
		t.Fatalf("WaitForPayment: %v", err)
	}
	if payment.Status != "confirmed" || atomic.LoadInt32(calls) != 4 {
		t.Errorf("status %q after %d calls", payment.Status, *calls)
	}
	if len(seen) != 3 {
		t.Errorf("onPoll saw %v, want 3 payments (the 429 is retried)", seen)
	}
}

func TestWaitForPaymentFailedOutcome(t *testing.T) {
	client, _ := statusServer(t, "pending", "expired")
	payment, err := client.WaitForPayment(context.Background(), "pay_123", fastPolling()...)
	if !errors.Is(err, fluxapay.ErrPaymentNotSuccessful) {
		t.Fatalf("expected ErrPaymentNotSuccessful, got %v", err)
	}
	var outcome *fluxapay.PaymentOutcomeError
	if !errors.As(err, &outcome) || outcome.Payment.Status != "expired" || payment.Status != "expired" {
		t.Fatalf("unexpected outcome %v / %+v", err, payment)
	}
}

func TestWaitForPaymentStopsOnNonRetryableError(t *testing.T) {
	client, calls := statusServer(t, "pending", "500")
	_, err := client.WaitForPayment(context.Background(), "pay_123", fastPolling()...)
	var apiErr *fluxapay.APIError
	if !errors.As(err, &apiErr) || apiErr.StatusCode != 500 {
		t.Fatalf("expected 500 APIError, got %v", err)
	}
	if atomic.LoadInt32(calls) != 2 {
		t.Errorf("calls = %d, want 2", *calls)
	}
}

func TestWaitForPaymentTimeout(t *testing.T) {
	client, _ := statusServer(t, "pending")
	start := time.Now()
	payment, err := client.WaitForPayment(context.Background(), "pay_123",
		fluxapay.WithPollInterval(5*time.Millisecond), fluxapay.WithPollTimeout(60*time.Millisecond))
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline exceeded, got %v", err)
	}
	if payment == nil || payment.Status != "pending" {
		t.Errorf("expected the last pending payment, got %+v", payment)
	}
	if time.Since(start) > time.Second {
		t.Errorf("timeout took %v", time.Since(start))
	}
}

func TestWaitForPaymentContextCancel(t *testing.T) {
	client, _ := statusServer(t, "pending")
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	_, err := client.WaitForPayment(ctx, "pay_123", fluxapay.WithPollInterval(5*time.Millisecond))
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}

func TestIsTerminalPaymentStatus(t *testing.T) {
	for _, s := range []string{"confirmed", "paid", "completed", "failed", "expired", "cancelled", "refunded"} {
		if !fluxapay.IsTerminalPaymentStatus(s) {
			t.Errorf("%s should be terminal", s)
		}
	}
	for _, s := range []string{"pending", "partially_paid", ""} {
		if fluxapay.IsTerminalPaymentStatus(s) {
			t.Errorf("%s should not be terminal", s)
		}
	}
}
