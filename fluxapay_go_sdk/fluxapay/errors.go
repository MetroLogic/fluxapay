package fluxapay

import (
	"encoding/json"
	"fmt"
)

// APIError represents a structured error returned by the FluxaPay API.
type APIError struct {
	StatusCode int             `json:"status"`
	ErrorCode  string          `json:"code"`
	Message    string          `json:"message"`
	RequestID  string          `json:"request_id,omitempty"`
	Retryable  bool            `json:"-"`
	Raw        json.RawMessage `json:"-"`

	// Code is retained for compatibility. New code should use ErrorCode.
	Code string `json:"-"`
}

// Error returns a human-readable API error message.
func (e *APIError) Error() string {
	return fmt.Sprintf("fluxapay: HTTP %d — %s", e.StatusCode, e.Message)
}

// Error is retained as an alias for backwards compatibility.
type Error = APIError

// AuthenticationError represents an authentication or authorization failure.
type AuthenticationError struct{ *APIError }

// Unwrap exposes the underlying API error to errors.Is and errors.As.
func (e *AuthenticationError) Unwrap() error { return e.APIError }

// RateLimitError represents a rate-limit response.
type RateLimitError struct{ *APIError }

// Unwrap exposes the underlying API error to errors.Is and errors.As.
func (e *RateLimitError) Unwrap() error { return e.APIError }

// InvalidRequestError represents a malformed or invalid API request.
type InvalidRequestError struct{ *APIError }

// Unwrap exposes the underlying API error to errors.Is and errors.As.
func (e *InvalidRequestError) Unwrap() error { return e.APIError }
