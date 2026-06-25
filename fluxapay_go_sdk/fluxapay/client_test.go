package fluxapay_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func newTestServer(t *testing.T, handler http.HandlerFunc) (*httptest.Server, *fluxapay.Client) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))
	return srv, client
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

var paymentFixture = fluxapay.Payment{
	ID:             "pay_123",
	Amount:         49.99,
	Currency:       "USD",
	Status:         "pending",
	CheckoutURL:    "https://pay.fluxapay.com/pay_123",
	StellarAddress: "GABC123",
	CustomerEmail:  "buyer@example.com",
	CreatedAt:      "2024-01-01T00:00:00Z",
	ExpiresAt:      "2024-01-01T00:30:00Z",
}

// ── Payments ──────────────────────────────────────────────────────────────────

func TestPaymentsCreate(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/payments" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		writeJSON(w, 200, paymentFixture)
	})

	payment, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount:        49.99,
		Currency:      "USD",
		CustomerEmail: "buyer@example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if payment.ID != "pay_123" {
		t.Errorf("expected pay_123, got %s", payment.ID)
	}
}

func TestPaymentsGet(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, paymentFixture)
	})

	payment, err := client.Payments.Get(context.Background(), "pay_123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if payment.CheckoutURL != paymentFixture.CheckoutURL {
		t.Errorf("checkout_url mismatch")
	}
}

func TestPaymentsGetStatus(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, paymentFixture)
	})

	status, err := client.Payments.GetStatus(context.Background(), "pay_123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status.Status != "pending" {
		t.Errorf("expected pending, got %s", status.Status)
	}
}

func TestPaymentsList(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, fluxapay.PaymentList{Payments: []fluxapay.Payment{paymentFixture}, Total: 1})
	})

	list, err := client.Payments.List(context.Background(), fluxapay.ListPaymentsParams{Page: 1, Limit: 10})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if list.Total != 1 {
		t.Errorf("expected total 1, got %d", list.Total)
	}
}

// ── Settlements ───────────────────────────────────────────────────────────────

func TestSettlementsList(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, fluxapay.SettlementList{Settlements: []fluxapay.Settlement{}, Total: 0})
	})

	list, err := client.Settlements.List(context.Background(), fluxapay.ListSettlementsParams{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if list.Total != 0 {
		t.Errorf("expected 0, got %d", list.Total)
	}
}

func TestSettlementsGet(t *testing.T) {
	fixture := fluxapay.Settlement{ID: "settle_1", Amount: 100.0, Currency: "USD", Status: "completed"}
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, fixture)
	})

	s, err := client.Settlements.Get(context.Background(), "settle_1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.ID != "settle_1" {
		t.Errorf("expected settle_1, got %s", s.ID)
	}
}

// ── Error handling ────────────────────────────────────────────────────────────

func TestAPIErrorPropagation(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 401, map[string]string{"message": "Unauthorized"})
	})

	_, err := client.Payments.Create(context.Background(), fluxapay.CreatePaymentParams{
		Amount: 1, Currency: "USD", CustomerEmail: "x@x.com",
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	apiErr, ok := err.(*fluxapay.Error)
	if !ok {
		t.Fatalf("expected *fluxapay.Error, got %T", err)
	}
	if apiErr.StatusCode != 401 {
		t.Errorf("expected 401, got %d", apiErr.StatusCode)
	}
}

func TestContextCancellation(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		writeJSON(w, 200, paymentFixture)
	})

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()

	_, err := client.Payments.Get(ctx, "pay_123")
	if err == nil {
		t.Fatal("expected context cancellation error")
	}
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

func makeSig(body, ts, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "." + body))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestWebhookVerifyValid(t *testing.T) {
	client := fluxapay.New("sk_live_test")
	body := `{"event":"payment.confirmed"}`
	ts := time.Now().UTC().Format(time.RFC3339)
	secret := "whsec_test"
	sig := makeSig(body, ts, secret)

	if !client.Webhooks.Verify(body, sig, ts, secret, 300) {
		t.Error("expected valid signature")
	}
}

func TestWebhookVerifyBadSignature(t *testing.T) {
	client := fluxapay.New("sk_live_test")
	ts := time.Now().UTC().Format(time.RFC3339)
	if client.Webhooks.Verify(`{"event":"x"}`, "badsig", ts, "whsec_test", 300) {
		t.Error("expected invalid signature")
	}
}

func TestWebhookVerifyExpired(t *testing.T) {
	client := fluxapay.New("sk_live_test")
	body := `{"event":"payment.confirmed"}`
	oldTS := time.Now().Add(-10 * time.Minute).UTC().Format(time.RFC3339)
	secret := "whsec_test"
	sig := makeSig(body, oldTS, secret)

	if client.Webhooks.Verify(body, sig, oldTS, secret, 300) {
		t.Error("expected expired webhook to be rejected")
	}
}

func TestWebhookParse(t *testing.T) {
	client := fluxapay.New("sk_live_test")
	raw := `{"event":"payment.confirmed","payment_id":"pay_1","merchant_id":"m_1","timestamp":"2024-01-01T00:00:00Z","data":{}}`
	ev, err := client.Webhooks.Parse(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Event != "payment.confirmed" {
		t.Errorf("expected payment.confirmed, got %s", ev.Event)
	}
}
