// Package fluxapay provides a Go client for the FluxaPay payment gateway API.
//
// Usage:
//
//	client := fluxapay.New("sk_live_...")
//	payment, err := client.Payments.Create(ctx, fluxapay.CreatePaymentParams{
//	    Amount:        49.99,
//	    Currency:      "USD",
//	    CustomerEmail: "buyer@example.com",
//	})
package fluxapay

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const (
	defaultBaseURL = "https://api.fluxapay.com"
	apiVersion     = "v1"
	Version        = "0.1.0"
)

// ── Errors ────────────────────────────────────────────────────────────────────

// Error represents an API error returned by FluxaPay.
type Error struct {
	StatusCode int
	Message    string
	Raw        json.RawMessage
}

func (e *Error) Error() string {
	return fmt.Sprintf("fluxapay: HTTP %d — %s", e.StatusCode, e.Message)
}

// ── Models ────────────────────────────────────────────────────────────────────

// Payment represents a FluxaPay payment object.
type Payment struct {
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

// PaymentStatus is a lightweight status view of a payment.
type PaymentStatus struct {
	ID              string `json:"id"`
	Status          string `json:"status"`
	TransactionHash string `json:"transaction_hash,omitempty"`
	ConfirmedAt     string `json:"confirmed_at,omitempty"`
}

// PaymentList is the response from listing payments.
type PaymentList struct {
	Payments []Payment `json:"payments"`
	Total    int       `json:"total"`
}

// CreatePaymentParams holds parameters for creating a payment.
type CreatePaymentParams struct {
	Amount           float64                `json:"amount"`
	Currency         string                 `json:"currency"`
	CustomerEmail    string                 `json:"customer_email"`
	OrderID          string                 `json:"order_id,omitempty"`
	SuccessURL       string                 `json:"success_url,omitempty"`
	CancelURL        string                 `json:"cancel_url,omitempty"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
	ExpiresInMinutes int                    `json:"expires_in_minutes,omitempty"`
}

// ListPaymentsParams holds optional filters for listing payments.
type ListPaymentsParams struct {
	Page   int
	Limit  int
	Status string
}

// Settlement represents a FluxaPay settlement object.
type Settlement struct {
	ID        string  `json:"id"`
	Amount    float64 `json:"amount"`
	Currency  string  `json:"currency"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"created_at"`
}

// SettlementList is the response from listing settlements.
type SettlementList struct {
	Settlements []Settlement `json:"settlements"`
	Total       int          `json:"total"`
}

// ListSettlementsParams holds optional filters for listing settlements.
type ListSettlementsParams struct {
	Page     int
	Limit    int
	Status   string
	Currency string
	DateFrom string
	DateTo   string
}

// WebhookEvent is a parsed FluxaPay webhook payload.
type WebhookEvent struct {
	Event      string                 `json:"event"`
	PaymentID  string                 `json:"payment_id"`
	MerchantID string                 `json:"merchant_id"`
	Timestamp  string                 `json:"timestamp"`
	Data       map[string]interface{} `json:"data"`
}

// ── Client ────────────────────────────────────────────────────────────────────

// Client is the FluxaPay API client.
type Client struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client

	Payments    *PaymentsResource
	Settlements *SettlementsResource
	Webhooks    *WebhooksResource
}

// New creates a new FluxaPay client with the given API key.
func New(apiKey string, opts ...Option) *Client {
	c := &Client{
		apiKey:     apiKey,
		baseURL:    defaultBaseURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
	for _, o := range opts {
		o(c)
	}
	c.Payments = &PaymentsResource{client: c}
	c.Settlements = &SettlementsResource{client: c}
	c.Webhooks = &WebhooksResource{}
	return c
}

// Option is a functional option for configuring the Client.
type Option func(*Client)

// WithBaseURL overrides the default API base URL.
func WithBaseURL(u string) Option {
	return func(c *Client) { c.baseURL = u }
}

// WithHTTPClient replaces the default http.Client.
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) { c.httpClient = hc }
}

// ── Internal HTTP ─────────────────────────────────────────────────────────────

func (c *Client) do(ctx context.Context, method, path string, body interface{}, out interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("fluxapay: marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("fluxapay: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Version", apiVersion)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fluxapay: http: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("fluxapay: read body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errBody struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(raw, &errBody)
		msg := errBody.Message
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return &Error{StatusCode: resp.StatusCode, Message: msg, Raw: raw}
	}

	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("fluxapay: decode response: %w", err)
		}
	}
	return nil
}

// ── Payments resource ─────────────────────────────────────────────────────────

// PaymentsResource groups payment-related API calls.
type PaymentsResource struct{ client *Client }

// Create creates a new payment.
func (r *PaymentsResource) Create(ctx context.Context, params CreatePaymentParams) (*Payment, error) {
	var out Payment
	if err := r.client.do(ctx, http.MethodPost, "/api/payments", params, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Get retrieves a payment by ID.
func (r *PaymentsResource) Get(ctx context.Context, paymentID string) (*Payment, error) {
	var out Payment
	if err := r.client.do(ctx, http.MethodGet, "/api/payments/"+paymentID, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetStatus returns the status of a payment.
func (r *PaymentsResource) GetStatus(ctx context.Context, paymentID string) (*PaymentStatus, error) {
	var out PaymentStatus
	if err := r.client.do(ctx, http.MethodGet, "/api/payments/"+paymentID, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// List returns a paginated list of payments.
func (r *PaymentsResource) List(ctx context.Context, params ListPaymentsParams) (*PaymentList, error) {
	q := url.Values{}
	if params.Page > 0 {
		q.Set("page", strconv.Itoa(params.Page))
	}
	if params.Limit > 0 {
		q.Set("limit", strconv.Itoa(params.Limit))
	}
	if params.Status != "" {
		q.Set("status", params.Status)
	}
	path := "/api/payments"
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	var out PaymentList
	if err := r.client.do(ctx, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ── Settlements resource ──────────────────────────────────────────────────────

// SettlementsResource groups settlement-related API calls.
type SettlementsResource struct{ client *Client }

// List returns a paginated list of settlements.
func (r *SettlementsResource) List(ctx context.Context, params ListSettlementsParams) (*SettlementList, error) {
	q := url.Values{}
	if params.Page > 0 {
		q.Set("page", strconv.Itoa(params.Page))
	}
	if params.Limit > 0 {
		q.Set("limit", strconv.Itoa(params.Limit))
	}
	if params.Status != "" {
		q.Set("status", params.Status)
	}
	if params.Currency != "" {
		q.Set("currency", params.Currency)
	}
	if params.DateFrom != "" {
		q.Set("date_from", params.DateFrom)
	}
	if params.DateTo != "" {
		q.Set("date_to", params.DateTo)
	}
	path := "/api/settlements"
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	var out SettlementList
	if err := r.client.do(ctx, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Get retrieves a settlement by ID.
func (r *SettlementsResource) Get(ctx context.Context, settlementID string) (*Settlement, error) {
	var out Settlement
	if err := r.client.do(ctx, http.MethodGet, "/api/settlements/"+settlementID, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Summary returns settlement summary statistics.
func (r *SettlementsResource) Summary(ctx context.Context) (map[string]interface{}, error) {
	var out map[string]interface{}
	if err := r.client.do(ctx, http.MethodGet, "/api/settlements/summary", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ── Webhooks resource ─────────────────────────────────────────────────────────

// WebhooksResource groups webhook helpers.
type WebhooksResource struct{}

// Verify validates a FluxaPay webhook HMAC-SHA256 signature.
// toleranceSeconds is the replay-protection window (default 300 if <= 0).
func (r *WebhooksResource) Verify(rawBody, signature, timestamp, secret string, toleranceSeconds int) bool {
	if rawBody == "" || signature == "" || timestamp == "" || secret == "" {
		return false
	}
	if toleranceSeconds <= 0 {
		toleranceSeconds = 300
	}
	ts, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		ts, err = time.Parse("2006-01-02T15:04:05Z", timestamp)
		if err != nil {
			return false
		}
	}
	if time.Since(ts).Abs() > time.Duration(toleranceSeconds)*time.Second {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "." + rawBody))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

// Parse decodes a raw webhook body into a WebhookEvent.
func (r *WebhooksResource) Parse(rawBody string) (*WebhookEvent, error) {
	var ev WebhookEvent
	if err := json.Unmarshal([]byte(rawBody), &ev); err != nil {
		return nil, fmt.Errorf("fluxapay: parse webhook: %w", err)
	}
	return &ev, nil
}
