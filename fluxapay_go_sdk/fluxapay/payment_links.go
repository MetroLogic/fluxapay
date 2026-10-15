package fluxapay

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// ErrInvalidParams is returned (wrapped) when request parameters fail
// client-side validation before any network call is made.
var ErrInvalidParams = errors.New("fluxapay: invalid parameters")

// PaymentLink is a reusable, shareable payment link. Amount is nil for
// open-amount links, where the payer chooses the amount.
type PaymentLink struct {
	ID            string                 `json:"id"`
	Slug          string                 `json:"slug"`
	Title         string                 `json:"title"`
	Description   *string                `json:"description"`
	Amount        *float64               `json:"amount"`
	Currency      string                 `json:"currency"`
	RedirectURL   *string                `json:"redirect_url,omitempty"`
	Expiry        *string                `json:"expiry,omitempty"`
	Active        bool                   `json:"active"`
	Expired       bool                   `json:"expired,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
	ShortURL      string                 `json:"short_url,omitempty"`
	TotalPayments int                    `json:"total_payments"`
	TotalVolume   float64                `json:"total_volume"`
	CreatedAt     string                 `json:"created_at,omitempty"`
	UpdatedAt     string                 `json:"updated_at,omitempty"`
}

// CreatePaymentLinkParams holds the fields for creating a payment link.
type CreatePaymentLinkParams struct {
	// Title is shown on the checkout page. Required, 1-200 characters.
	Title string `json:"title"`
	// Description is optional, up to 500 characters.
	Description string `json:"description,omitempty"`
	// Amount fixes the price in major units. Leave 0 for an open-amount link.
	Amount float64 `json:"amount,omitempty"`
	// Currency is a 3-letter code, e.g. "USD". Required.
	Currency string `json:"currency"`
	// RedirectURL is stored with the link.
	RedirectURL string `json:"redirect_url,omitempty"`
	// Expiry is an RFC 3339 timestamp after which the link stops accepting payments.
	Expiry string `json:"expiry,omitempty"`
	// Metadata is copied onto every payment created from the link (max 10 keys).
	Metadata map[string]interface{} `json:"metadata,omitempty"`
	// CustomerID pre-assigns the link to one of your customers.
	CustomerID string `json:"customer_id,omitempty"`
}

// Validate checks the parameters the API would reject, so mistakes surface
// without a network round trip. Errors wrap ErrInvalidParams.
func (p *CreatePaymentLinkParams) Validate() error {
	if p == nil {
		return fmt.Errorf("%w: params must not be nil", ErrInvalidParams)
	}
	title := strings.TrimSpace(p.Title)
	if title == "" {
		return fmt.Errorf("%w: title is required", ErrInvalidParams)
	}
	if len([]rune(p.Title)) > 200 {
		return fmt.Errorf("%w: title must be at most 200 characters", ErrInvalidParams)
	}
	if len([]rune(p.Description)) > 500 {
		return fmt.Errorf("%w: description must be at most 500 characters", ErrInvalidParams)
	}
	if len(p.Currency) != 3 {
		return fmt.Errorf("%w: currency must be a 3-letter code", ErrInvalidParams)
	}
	if p.Amount < 0 {
		return fmt.Errorf("%w: amount must not be negative", ErrInvalidParams)
	}
	if len(p.Metadata) > 10 {
		return fmt.Errorf("%w: metadata cannot exceed 10 key-value pairs", ErrInvalidParams)
	}
	return nil
}

// ListPaymentLinksParams holds optional filters for listing payment links.
type ListPaymentLinksParams struct {
	Page  int
	Limit int
	// Active filters by state when non-nil.
	Active *bool
}

// PaymentLinkList is the response from listing payment links.
type PaymentLinkList struct {
	Data []PaymentLink `json:"data"`
	Meta struct {
		Total int `json:"total"`
		Page  int `json:"page"`
		Limit int `json:"limit"`
	} `json:"meta"`
}

// PaymentLinksResource groups payment-link API calls.
type PaymentLinksResource struct{ client *Client }

// Create creates a payment link. The returned link's ShortURL is the URL to share.
func (r *PaymentLinksResource) Create(ctx context.Context, params *CreatePaymentLinkParams) (*PaymentLink, error) {
	if err := params.Validate(); err != nil {
		return nil, err
	}
	var out PaymentLink
	if err := r.client.do(ctx, http.MethodPost, "/api/v1/payment-links", params, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Get retrieves a payment link by ID.
func (r *PaymentLinksResource) Get(ctx context.Context, linkID string) (*PaymentLink, error) {
	if strings.TrimSpace(linkID) == "" {
		return nil, fmt.Errorf("%w: link ID is required", ErrInvalidParams)
	}
	var out PaymentLink
	if err := r.client.do(ctx, http.MethodGet, "/api/v1/payment-links/"+url.PathEscape(linkID), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// List returns a paginated list of payment links.
func (r *PaymentLinksResource) List(ctx context.Context, params ListPaymentLinksParams) (*PaymentLinkList, error) {
	q := url.Values{}
	if params.Page > 0 {
		q.Set("page", strconv.Itoa(params.Page))
	}
	if params.Limit > 0 {
		q.Set("limit", strconv.Itoa(params.Limit))
	}
	if params.Active != nil {
		q.Set("active", strconv.FormatBool(*params.Active))
	}
	path := "/api/v1/payment-links"
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	var out PaymentLinkList
	if err := r.client.do(ctx, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CreatePaymentLink is a convenience wrapper around c.PaymentLinks.Create.
func (c *Client) CreatePaymentLink(ctx context.Context, params *CreatePaymentLinkParams) (*PaymentLink, error) {
	return c.PaymentLinks.Create(ctx, params)
}
