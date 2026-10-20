// Package fluxapay provides a Go client for the FluxaPay payment gateway API.
//
// This file contains test helpers for developers integrating the FluxaPay Go SDK
// in their CI/CD pipelines. The mock server utilities allow testing payment
// creation, polling, and error handling without hitting live or testnet API
// servers.
//
// Usage:
//
//	import fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
//	import "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
//
//	srv := fluxapay.NewMockServer(fluxapay.MockServerConfig{
//	    Payments: []fluxapay.MockPayment{
//	        {ID: "pay_123", Amount: 49.99, Currency: "USD", Status: "pending"},
//	    },
//	})
//	defer srv.Close()
//
//	client := fluxapay.New("sk_live_test", fluxapay.WithBaseURL(srv.URL))
package fluxapay

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
)

// ── Mock fixtures ─────────────────────────────────────────────────────────────

// MockPayment defines a predefined payment response for the mock server.
type MockPayment struct {
	ID             string                 `json:"id"`
	Amount         float64                `json:"amount"`
	Currency       string                 `json:"currency"`
	Status         string                 `json:"status"`
	CheckoutURL    string                 `json:"checkout_url"`
	StellarAddress string                 `json:"stellar_address"`
	CustomerEmail  string                 `json:"customer_email"`
	OrderID        string                 `json:"order_id,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt      string                 `json:"created_at"`
	ExpiresAt      string                 `json:"expires_at"`
}

// MockError defines a predefined error response for the mock server.
type MockError struct {
	StatusCode int    `json:"status_code"`
	Message    string `json:"message"`
	Code       string `json:"code"`
	Path       string `json:"path"` // Pattern to match, e.g. "/api/payments/pay_123"
	Method     string `json:"method"`
}

// MockServerConfig configures the behavior of NewMockServer.
//
// Fields:
//   - Payments:        Predefined payment responses keyed by ID. The first
//                      payment in the slice is returned for create requests
//                      if no ID match is found.
//   - ErrorOnCreate:   If non-nil, the create endpoint returns this error
//                      instead of a success response.
//   - ErrorOnGet:      If non-nil, the get endpoint returns this error for
//                      any payment ID that is not in the Payments slice.
//   - RequireAPIKey:   If set, requests without a matching Authorization
//                      header receive a 401 error.
//   - APIKey:          The expected API key value (default "sk_live_test").
//   - RequestLog:      If non-nil, every request is appended to this slice.
//                      Useful for asserting request behavior in tests.
type MockServerConfig struct {
	Payments      []MockPayment
	ErrorOnCreate *MockError
	ErrorOnGet    *MockError
	RequireAPIKey bool
	APIKey        string
	RequestLog    *[]MockRequest
}

// MockRequest records a single HTTP request received by the mock server.
type MockRequest struct {
	Method string
	Path   string
	Body   []byte
}

// ── Mock server ──────────────────────────────────────────────────────────────

// MockServer wraps an httptest.Server with FluxaPay-specific mock handlers.
// It provides pre-configured responses for /v1/payments/create,
// /v1/payments/:id, and error scenarios (invalid API key, insufficient funds).
type MockServer struct {
	*httptest.Server
	config     MockServerConfig
	mu         sync.RWMutex
	payments   map[string]MockPayment
	createIdx  int
}

// NewMockServer starts a mock HTTP server with the given configuration.
// The caller is responsible for calling Close() (use defer srv.Close()).
func NewMockServer(cfg MockServerConfig) *MockServer {
	if cfg.APIKey == "" {
		cfg.APIKey = "sk_live_test"
	}
	ms := &MockServer{
		config:   cfg,
		payments: make(map[string]MockPayment),
	}
	for _, p := range cfg.Payments {
		ms.payments[p.ID] = p
	}

	ms.Server = httptest.NewServer(http.HandlerFunc(ms.handler))
	return ms
}

func (ms *MockServer) handler(w http.ResponseWriter, r *http.Request) {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	// Log request if requested.
	if ms.config.RequestLog != nil {
		body := make([]byte, 0)
		if r.Body != nil {
			// We can't read the body here without affecting downstream
			// consumers, but for logging we do a best-effort read.
			// Note: httptest.Server gives us a fresh body each request.
		}
		*ms.config.RequestLog = append(*ms.config.RequestLog, MockRequest{
			Method: r.Method,
			Path:   r.URL.Path,
			Body:   body,
		})
	}

	// API key validation.
	if ms.config.RequireAPIKey {
		auth := r.Header.Get("Authorization")
		expected := "Bearer " + ms.config.APIKey
		if auth != expected {
			writeMockError(w, 401, "Unauthorized", "UNAUTHORIZED")
			return
		}
	}

	path := r.URL.Path

	// Route: Create payment — POST /api/payments
	if r.Method == http.MethodPost && path == "/api/payments" {
		if ms.config.ErrorOnCreate != nil {
			e := ms.config.ErrorOnCreate
			writeMockError(w, e.StatusCode, e.Message, e.Code)
			return
		}

		// Parse the create params to return a sensible payment.
		var params CreatePaymentParams
		_ = json.NewDecoder(r.Body).Decode(&params)

		// Use the first predefined payment, or build one from params.
		var payment MockPayment
		if len(ms.config.Payments) > 0 {
			payment = ms.config.Payments[0]
		} else {
			payment = MockPayment{
				ID:             "pay_mock",
				Amount:         params.Amount,
				Currency:       params.Currency,
				Status:         "pending",
				CheckoutURL:    "https://pay.fluxapay.com/pay_mock",
				StellarAddress: "GMOCKADDRESS",
				CustomerEmail:  params.CustomerEmail,
				CreatedAt:      "2024-01-01T00:00:00Z",
				ExpiresAt:      "2024-01-01T00:30:00Z",
			}
		}
		writeJSONResponse(w, 200, payment)
		return
	}

	// Route: Get payment — GET /api/payments/:id
	if r.Method == http.MethodGet && strings.HasPrefix(path, "/api/payments/") {
		paymentID := strings.TrimPrefix(path, "/api/payments/")

		// Check for a configured error on get.
		if ms.config.ErrorOnGet != nil {
			e := ms.config.ErrorOnGet
			if e.Path == "" || strings.Contains(path, e.Path) {
				if e.Method == "" || e.Method == r.Method {
					writeMockError(w, e.StatusCode, e.Message, e.Code)
					return
				}
			}
		}

		if payment, ok := ms.payments[paymentID]; ok {
			writeJSONResponse(w, 200, payment)
			return
		}

		// Payment not found.
		writeMockError(w, 404, "payment not found", "NOT_FOUND")
		return
	}

	// Route: List payments — GET /api/payments
	if r.Method == http.MethodGet && path == "/api/payments" {
		payments := make([]MockPayment, 0, len(ms.payments))
		for _, p := range ms.payments {
			payments = append(payments, p)
		}
		writeJSONResponse(w, 200, map[string]interface{}{
			"payments": payments,
			"total":    len(payments),
		})
		return
	}

	// Fallback for unhandled routes.
	writeMockError(w, 404, fmt.Sprintf("mock server: unhandled route %s %s", r.Method, path), "NOT_FOUND")
}

// ── Mock server helpers ──────────────────────────────────────────────────────

// AddPayment adds or replaces a predefined payment response in the mock server.
// This is useful for simulating status transitions (e.g., pending → confirmed).
func (ms *MockServer) AddPayment(p MockPayment) {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	ms.payments[p.ID] = p
}

// GetPayment returns the current mock payment by ID, if it exists.
func (ms *MockServer) GetPayment(id string) (MockPayment, bool) {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	p, ok := ms.payments[id]
	return p, ok
}

// UpdatePaymentStatus updates the status of a mock payment. This simulates
// the real FluxaPay API updating a payment's status after on-chain verification.
func (ms *MockServer) UpdatePaymentStatus(id, status string) bool {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	if p, ok := ms.payments[id]; ok {
		p.Status = status
		ms.payments[id] = p
		return true
	}
	return false
}

// SetErrorOnCreate configures the mock server to return an error for
// the next create request. Pass nil to clear the error.
func (ms *MockServer) SetErrorOnCreate(e *MockError) {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	ms.config.ErrorOnCreate = e
}

// SetErrorOnGet configures the mock server to return an error for get requests.
// Pass nil to clear the error.
func (ms *MockServer) SetErrorOnGet(e *MockError) {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	ms.config.ErrorOnGet = e
}

// ── Internal helpers ─────────────────────────────────────────────────────────

func writeJSONResponse(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeMockError(w http.ResponseWriter, status int, message, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Request-ID", "mock_req_"+fmt.Sprintf("%d", status))
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": message,
		"code":    code,
	})
}
