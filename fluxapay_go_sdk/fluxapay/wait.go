package fluxapay

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// ── Payment polling ───────────────────────────────────────────────────────────

// Payment statuses after which a payment no longer changes on its own.
var terminalPaymentStatuses = map[string]bool{
	"confirmed":          true,
	"paid":               true,
	"completed":          true,
	"overpaid":           true,
	"failed":             true,
	"expired":            true,
	"cancelled":          true,
	"refunded":           true,
	"partially_refunded": true,
}

// Payment statuses that mean the payer's money arrived.
var successfulPaymentStatuses = map[string]bool{
	"confirmed": true,
	"paid":      true,
	"completed": true,
	"overpaid":  true,
}

// IsTerminalPaymentStatus reports whether a payment in this status will not
// change again without merchant action.
func IsTerminalPaymentStatus(status string) bool { return terminalPaymentStatuses[status] }

// ErrPaymentNotSuccessful is wrapped by the error WaitForPayment returns when the
// payment ends in a terminal status that is not a success (failed, expired, …).
var ErrPaymentNotSuccessful = errors.New("fluxapay: payment did not succeed")

// PaymentOutcomeError reports a payment that finished without succeeding.
type PaymentOutcomeError struct {
	Payment *Payment
}

func (e *PaymentOutcomeError) Error() string {
	return fmt.Sprintf("fluxapay: payment %s ended with status %q", e.Payment.ID, e.Payment.Status)
}

// Unwrap lets errors.Is(err, ErrPaymentNotSuccessful) match.
func (e *PaymentOutcomeError) Unwrap() error { return ErrPaymentNotSuccessful }

type pollConfig struct {
	interval    time.Duration
	maxInterval time.Duration
	multiplier  float64
	timeout     time.Duration
	onPoll      func(*Payment)
}

// PollOption configures WaitForPayment.
type PollOption func(*pollConfig)

// WithPollInterval sets the first wait between polls (default 2s).
func WithPollInterval(d time.Duration) PollOption {
	return func(c *pollConfig) {
		if d > 0 {
			c.interval = d
		}
	}
}

// WithPollBackoff grows the wait by multiplier after every poll, capped at max
// (defaults: 1.5× up to 30s). A multiplier of 1 polls at a fixed interval.
func WithPollBackoff(multiplier float64, max time.Duration) PollOption {
	return func(c *pollConfig) {
		if multiplier >= 1 {
			c.multiplier = multiplier
		}
		if max > 0 {
			c.maxInterval = max
		}
	}
}

// WithPollTimeout stops waiting after d (default: no limit beyond ctx).
func WithPollTimeout(d time.Duration) PollOption {
	return func(c *pollConfig) { c.timeout = d }
}

// WithOnPoll calls fn with every payment fetched, e.g. to log progress.
func WithOnPoll(fn func(*Payment)) PollOption {
	return func(c *pollConfig) { c.onPoll = fn }
}

// WaitForPayment polls the payment until it reaches a terminal status, ctx is
// done, or the poll timeout passes.
//
//   - A successful terminal status (confirmed, paid, completed, overpaid) returns
//     the payment and a nil error.
//   - Any other terminal status (failed, expired, cancelled, …) returns the
//     payment and a *PaymentOutcomeError (errors.Is(err, ErrPaymentNotSuccessful)).
//   - Cancellation or timeout returns the last payment seen (possibly nil) and
//     ctx.Err() (context.Canceled / context.DeadlineExceeded).
//   - Retryable API errors (429, 502, 503, 504) are retried on the next tick;
//     any other API error is returned immediately.
func (c *Client) WaitForPayment(ctx context.Context, paymentID string, opts ...PollOption) (*Payment, error) {
	cfg := pollConfig{interval: 2 * time.Second, maxInterval: 30 * time.Second, multiplier: 1.5}
	for _, o := range opts {
		if o != nil {
			o(&cfg)
		}
	}
	if cfg.timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, cfg.timeout)
		defer cancel()
	}

	wait := cfg.interval
	var last *Payment
	for {
		payment, err := c.Payments.Get(ctx, paymentID)
		switch {
		case err == nil:
			last = payment
			if cfg.onPoll != nil {
				cfg.onPoll(payment)
			}
			if IsTerminalPaymentStatus(payment.Status) {
				if successfulPaymentStatuses[payment.Status] {
					return payment, nil
				}
				return payment, &PaymentOutcomeError{Payment: payment}
			}
		case ctx.Err() != nil:
			return last, ctx.Err()
		case !isRetryable(err):
			return last, err
		}

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return last, ctx.Err()
		case <-timer.C:
		}
		wait = time.Duration(float64(wait) * cfg.multiplier)
		if wait > cfg.maxInterval {
			wait = cfg.maxInterval
		}
	}
}

func isRetryable(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Retryable
	}
	return false
}
