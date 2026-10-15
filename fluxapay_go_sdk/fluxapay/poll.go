package fluxapay

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	defaultPollInterval    = 2 * time.Second
	defaultMaxPollInterval = 30 * time.Second
	defaultPollBackoff     = 1.5
)

// ErrPaymentNotSuccessful is matched (via errors.Is) by *PaymentStatusError.
var ErrPaymentNotSuccessful = errors.New("fluxapay: payment reached a terminal non-successful status")

// PaymentStatusError is returned by WaitForPayment when the payment ends in a
// terminal status that is not a success, such as "expired" or "failed".
// The final payment is available in Payment.
type PaymentStatusError struct {
	PaymentID string
	Status    string
	Payment   *Payment
}

func (e *PaymentStatusError) Error() string {
	return fmt.Sprintf("fluxapay: payment %s ended with status %q", e.PaymentID, e.Status)
}

// Is reports whether target is ErrPaymentNotSuccessful.
func (e *PaymentStatusError) Is(target error) bool { return target == ErrPaymentNotSuccessful }

// WaitTimeoutError is returned by WaitForPayment when the context is cancelled
// or the poll timeout elapses before the payment reaches a terminal status.
// It unwraps to the context error, so errors.Is(err, context.DeadlineExceeded)
// and errors.Is(err, context.Canceled) work as expected.
type WaitTimeoutError struct {
	PaymentID string
	// LastStatus is the most recent status seen, or "" if no poll succeeded.
	LastStatus string
	// LastErr is the most recent transient polling error, if any.
	LastErr error
	Err     error
}

func (e *WaitTimeoutError) Error() string {
	msg := fmt.Sprintf("fluxapay: stopped waiting for payment %s", e.PaymentID)
	if e.LastStatus != "" {
		msg += fmt.Sprintf(" (last status %q)", e.LastStatus)
	}
	return msg + ": " + e.Err.Error()
}

func (e *WaitTimeoutError) Unwrap() error { return e.Err }

// PollOption configures WaitForPayment.
type PollOption func(*pollConfig)

type pollConfig struct {
	interval    time.Duration
	maxInterval time.Duration
	backoff     float64
	timeout     time.Duration
	success     map[string]bool
	failure     map[string]bool
	onPoll      func(*Payment)
}

func defaultPollConfig() *pollConfig {
	return &pollConfig{
		interval:    defaultPollInterval,
		maxInterval: defaultMaxPollInterval,
		backoff:     defaultPollBackoff,
		success:     statusSet("confirmed", "overpaid", "paid", "completed"),
		failure:     statusSet("expired", "failed", "cancelled"),
	}
}

func statusSet(statuses ...string) map[string]bool {
	m := make(map[string]bool, len(statuses))
	for _, s := range statuses {
		m[strings.ToLower(s)] = true
	}
	return m
}

// WithPollInterval sets the delay before the second poll (default 2s).
// Non-positive values are ignored.
func WithPollInterval(d time.Duration) PollOption {
	return func(c *pollConfig) {
		if d > 0 {
			c.interval = d
		}
	}
}

// WithMaxPollInterval caps the delay between polls (default 30s).
// Non-positive values are ignored.
func WithMaxPollInterval(d time.Duration) PollOption {
	return func(c *pollConfig) {
		if d > 0 {
			c.maxInterval = d
		}
	}
}

// WithPollBackoff sets the multiplier applied to the interval after each poll
// (default 1.5). Use 1 for a fixed interval. Values below 1 are ignored.
func WithPollBackoff(multiplier float64) PollOption {
	return func(c *pollConfig) {
		if multiplier >= 1 {
			c.backoff = multiplier
		}
	}
}

// WithPollTimeout bounds the total wait in addition to the context deadline.
// Zero (the default) means wait until the context is done.
func WithPollTimeout(d time.Duration) PollOption {
	return func(c *pollConfig) {
		if d > 0 {
			c.timeout = d
		}
	}
}

// WithSuccessStatuses replaces the statuses treated as success
// (default: confirmed, overpaid, paid, completed).
func WithSuccessStatuses(statuses ...string) PollOption {
	return func(c *pollConfig) {
		if len(statuses) > 0 {
			c.success = statusSet(statuses...)
		}
	}
}

// WithFailureStatuses replaces the terminal statuses treated as failure
// (default: expired, failed, cancelled).
func WithFailureStatuses(statuses ...string) PollOption {
	return func(c *pollConfig) {
		if len(statuses) > 0 {
			c.failure = statusSet(statuses...)
		}
	}
}

// WithOnPoll registers a callback invoked with every successfully fetched
// payment, e.g. to log progress.
func WithOnPoll(fn func(*Payment)) PollOption {
	return func(c *pollConfig) { c.onPoll = fn }
}

// nextPollInterval grows current by the backoff multiplier, capped at limit.
func nextPollInterval(current, limit time.Duration, backoff float64) time.Duration {
	next := time.Duration(float64(current) * backoff)
	if next > limit || next <= 0 {
		return limit
	}
	return next
}

// isTransient reports whether a polling error should be retried.
func isTransient(err error) bool {
	var apiErr *Error
	if errors.As(err, &apiErr) {
		return apiErr.Retryable
	}
	// Network-level failures (connection reset, DNS, per-request timeout)
	// surface as *url.Error from http.Client.Do. Anything else, such as an
	// undecodable response body, will not fix itself by polling again.
	var urlErr *url.Error
	return errors.As(err, &urlErr)
}

// WaitForPayment polls the payment until it reaches a terminal status, the
// context is done, or the optional poll timeout elapses.
//
// The first poll happens immediately; later polls back off exponentially
// from WithPollInterval up to WithMaxPollInterval. Transient errors (429,
// 502-504, network failures) are retried; other API errors are returned at once.
//
// Returns:
//   - the payment, nil error: a success status was reached
//   - the payment, *PaymentStatusError: a failure status was reached
//   - nil, *WaitTimeoutError: the context or poll timeout ended the wait
//   - nil, *Error or other error: a non-transient failure
func (r *PaymentsResource) WaitForPayment(ctx context.Context, paymentID string, opts ...PollOption) (*Payment, error) {
	if strings.TrimSpace(paymentID) == "" {
		return nil, fmt.Errorf("%w: payment ID is required", ErrInvalidParams)
	}
	cfg := defaultPollConfig()
	for _, o := range opts {
		o(cfg)
	}
	if cfg.interval > cfg.maxInterval {
		cfg.maxInterval = cfg.interval
	}

	if cfg.timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, cfg.timeout)
		defer cancel()
	}

	var lastStatus string
	var lastErr error
	interval := cfg.interval
	timer := time.NewTimer(0) // first poll immediately
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, &WaitTimeoutError{PaymentID: paymentID, LastStatus: lastStatus, LastErr: lastErr, Err: ctx.Err()}
		case <-timer.C:
		}

		payment, err := r.Get(ctx, paymentID)
		if err != nil {
			if ctx.Err() != nil {
				// The failure was caused by the context ending; keep the last
				// genuine polling error for diagnostics.
				return nil, &WaitTimeoutError{PaymentID: paymentID, LastStatus: lastStatus, LastErr: lastErr, Err: ctx.Err()}
			}
			if !isTransient(err) {
				return nil, err
			}
			lastErr = err
		} else {
			lastErr = nil
			lastStatus = payment.Status
			if cfg.onPoll != nil {
				cfg.onPoll(payment)
			}
			status := strings.ToLower(payment.Status)
			if cfg.success[status] {
				return payment, nil
			}
			if cfg.failure[status] {
				return payment, &PaymentStatusError{PaymentID: paymentID, Status: payment.Status, Payment: payment}
			}
		}

		timer.Reset(interval)
		interval = nextPollInterval(interval, cfg.maxInterval, cfg.backoff)
	}
}

// WaitForPayment is a convenience wrapper around c.Payments.WaitForPayment.
func (c *Client) WaitForPayment(ctx context.Context, paymentID string, opts ...PollOption) (*Payment, error) {
	return c.Payments.WaitForPayment(ctx, paymentID, opts...)
}
