package fluxapay

import (
	"context"
	"errors"
	"net/http"
	"net/url"
)

// ── Payment links ─────────────────────────────────────────────────────────────

// CreatePaymentLinkParams are the fields accepted by POST /api/v1/payment-links.
type CreatePaymentLinkParams struct {
	// Title shown on the hosted payment page (1-200 characters). Required.
	Title string `json:"title"`
	// Description shown under the title (up to 500 characters).
	Description string `json:"description,omitempty"`
	// Amount in major units (e.g. 49.99). Leave nil for a pay-what-you-want link.
	Amount *float64 `json:"amount,omitempty"`
	// Currency is a three-letter code such as "USD". Required.
	Currency string `json:"currency"`
	// RedirectURL is where the payer is sent after paying.
	RedirectURL string `json:"redirect_url,omitempty"`
	// Expiry is an RFC 3339 timestamp after which the link stops accepting payments.
	Expiry string `json:"expiry,omitempty"`
	// Metadata is stored with the link (at most 10 keys).
	Metadata map[string]interface{} `json:"metadata,omitempty"`
	// CustomerID ties the link to an existing customer.
	CustomerID string `json:"customer_id,omitempty"`
}

// PaymentLink is a reusable hosted payment page.
type PaymentLink struct {
	ID            string                 `json:"id"`
	Slug          string                 `json:"slug"`
	Title         string                 `json:"title"`
	Description   *string                `json:"description"`
	Amount        *float64               `json:"amount"`
	Currency      string                 `json:"currency"`
	RedirectURL   *string                `json:"redirect_url"`
	Expiry        *string                `json:"expiry"`
	Active        bool                   `json:"active"`
	Metadata      map[string]interface{} `json:"metadata"`
	ShortURL      string                 `json:"short_url"`
	TotalPayments int                    `json:"total_payments"`
	TotalVolume   float64                `json:"total_volume"`
	CreatedAt     string                 `json:"created_at"`
}

// ErrMissingParams is returned when a required params struct is nil.
var ErrMissingParams = errors.New("fluxapay: params are required")

// PaymentLinksResource groups payment-link API calls.
type PaymentLinksResource struct{ client *Client }

// Create creates a payment link. Pass WithIdempotencyKey to make retries safe.
func (r *PaymentLinksResource) Create(ctx context.Context, params *CreatePaymentLinkParams, opts ...RequestOption) (*PaymentLink, error) {
	if params == nil {
		return nil, ErrMissingParams
	}
	var out PaymentLink
	if err := r.client.do(ctx, http.MethodPost, "/api/v1/payment-links", params, &out, opts...); err != nil {
		return nil, err
	}
	return &out, nil
}

// Get retrieves a payment link by ID.
func (r *PaymentLinksResource) Get(ctx context.Context, linkID string) (*PaymentLink, error) {
	var out PaymentLink
	if err := r.client.do(ctx, http.MethodGet, "/api/v1/payment-links/"+url.PathEscape(linkID), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CreatePaymentLink creates a payment link. It is shorthand for
// c.PaymentLinks.Create and honours ctx cancellation and deadlines.
func (c *Client) CreatePaymentLink(ctx context.Context, params *CreatePaymentLinkParams, opts ...RequestOption) (*PaymentLink, error) {
	return c.PaymentLinks.Create(ctx, params, opts...)
}
