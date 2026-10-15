package fluxapay_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

const paymentLinkFixtureJSON = `{
	"id": "cm4link000001",
	"slug": "k3j9x2ab",
	"title": "Pro plan - monthly",
	"description": "FluxaPay Pro, billed monthly",
	"amount": 25,
	"currency": "USD",
	"redirect_url": "https://shop.example.com/thanks",
	"expiry": "2026-12-31T23:59:59.000Z",
	"active": true,
	"metadata": {"plan": "pro"},
	"short_url": "https://pay.fluxapay.com/pay/k3j9x2ab",
	"total_payments": 0,
	"total_volume": 0,
	"created_at": "2026-10-15T12:00:00.000Z"
}`

func TestCreatePaymentLinkSuccess(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/payment-links" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk_live_test" {
			t.Errorf("Authorization = %q", got)
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Errorf("Content-Type = %q", got)
		}

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if body["title"] != "Pro plan - monthly" || body["currency"] != "USD" || body["amount"] != 25.0 {
			t.Errorf("unexpected body: %v", body)
		}
		if _, ok := body["customer_id"]; ok {
			t.Errorf("empty optional fields must be omitted, got customer_id")
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(paymentLinkFixtureJSON))
	})

	link, err := client.CreatePaymentLink(context.Background(), &fluxapay.CreatePaymentLinkParams{
		Title:       "Pro plan - monthly",
		Amount:      25,
		Currency:    "USD",
		RedirectURL: "https://shop.example.com/thanks",
		Metadata:    map[string]interface{}{"plan": "pro"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if link.ID != "cm4link000001" || link.Slug != "k3j9x2ab" || !link.Active {
		t.Errorf("unexpected link: %+v", link)
	}
	if link.Amount == nil || *link.Amount != 25 {
		t.Errorf("Amount = %v, want 25", link.Amount)
	}
	if link.ShortURL != "https://pay.fluxapay.com/pay/k3j9x2ab" {
		t.Errorf("ShortURL = %q", link.ShortURL)
	}
	if link.Expiry == nil || *link.Expiry != "2026-12-31T23:59:59.000Z" {
		t.Errorf("Expiry = %v", link.Expiry)
	}
}

func TestCreatePaymentLinkOpenAmount(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if _, ok := body["amount"]; ok {
			t.Errorf("amount must be omitted for open-amount links, got %v", body["amount"])
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"cm4link000002","slug":"open1234","title":"Tip jar","amount":null,"currency":"USD","active":true}`))
	})

	link, err := client.PaymentLinks.Create(context.Background(), &fluxapay.CreatePaymentLinkParams{
		Title:    "Tip jar",
		Currency: "USD",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if link.Amount != nil {
		t.Errorf("Amount = %v, want nil for open-amount link", *link.Amount)
	}
}

func TestCreatePaymentLinkValidation(t *testing.T) {
	var calls int32
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		writeJSON(w, 201, map[string]string{})
	})

	tooManyKeys := map[string]interface{}{}
	for i := 0; i < 11; i++ {
		tooManyKeys[string(rune('a'+i))] = i
	}

	cases := map[string]*fluxapay.CreatePaymentLinkParams{
		"nil params":       nil,
		"missing title":    {Currency: "USD"},
		"blank title":      {Title: "   ", Currency: "USD"},
		"long title":       {Title: strings.Repeat("x", 201), Currency: "USD"},
		"long description": {Title: "ok", Currency: "USD", Description: strings.Repeat("x", 501)},
		"bad currency":     {Title: "ok", Currency: "US"},
		"negative amount":  {Title: "ok", Currency: "USD", Amount: -1},
		"too many keys":    {Title: "ok", Currency: "USD", Metadata: tooManyKeys},
	}
	for name, params := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := client.CreatePaymentLink(context.Background(), params)
			if !errors.Is(err, fluxapay.ErrInvalidParams) {
				t.Fatalf("err = %v, want ErrInvalidParams", err)
			}
		})
	}
	if n := atomic.LoadInt32(&calls); n != 0 {
		t.Errorf("validation failures must not hit the network, got %d calls", n)
	}
}

func TestCreatePaymentLinkAPIError(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 400, map[string]interface{}{
			"code":    "VALIDATION_ERROR",
			"message": "Validation failed",
			"errors":  []map[string]string{{"field": "redirect_url", "message": "Invalid URL"}},
		})
	})

	_, err := client.CreatePaymentLink(context.Background(), &fluxapay.CreatePaymentLinkParams{
		Title:       "Pro plan",
		Currency:    "USD",
		RedirectURL: "not-a-url",
	})
	var apiErr *fluxapay.Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *fluxapay.Error, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 400 || apiErr.Code != "VALIDATION_ERROR" || apiErr.Retryable {
		t.Errorf("unexpected error: %+v", apiErr)
	}
}

func TestCreatePaymentLinkContextCancelled(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := client.CreatePaymentLink(ctx, &fluxapay.CreatePaymentLinkParams{Title: "x", Currency: "USD"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

func TestPaymentLinksGetAndList(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/payment-links/cm4link000001":
			_, _ = w.Write([]byte(paymentLinkFixtureJSON))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/payment-links":
			q := r.URL.Query()
			if q.Get("page") != "2" || q.Get("limit") != "5" || q.Get("active") != "true" {
				t.Errorf("unexpected query: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"data":[` + paymentLinkFixtureJSON + `],"meta":{"total":6,"page":2,"limit":5}}`))
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.String())
			w.WriteHeader(http.StatusNotFound)
		}
	})

	link, err := client.PaymentLinks.Get(context.Background(), "cm4link000001")
	if err != nil || link.Slug != "k3j9x2ab" {
		t.Fatalf("Get: link=%+v err=%v", link, err)
	}

	active := true
	list, err := client.PaymentLinks.List(context.Background(), fluxapay.ListPaymentLinksParams{Page: 2, Limit: 5, Active: &active})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list.Data) != 1 || list.Meta.Total != 6 || list.Meta.Page != 2 {
		t.Errorf("unexpected list: %+v", list)
	}

	if _, err := client.PaymentLinks.Get(context.Background(), ""); !errors.Is(err, fluxapay.ErrInvalidParams) {
		t.Errorf("Get(\"\") err = %v, want ErrInvalidParams", err)
	}
}
