package fluxapay_test

import (
	"context"
	"errors"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

// statusSequence serves GET /api/payments/{id} returning the given statuses in
// order (repeating the last one) and counts the requests.
func statusSequence(t *testing.T, statuses ...string) (*fluxapay.Client, *int32) {
	t.Helper()
	var calls int32
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/payments/pay_123" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		n := int(atomic.AddInt32(&calls, 1)) - 1
		if n >= len(statuses) {
			n = len(statuses) - 1
		}
		p := paymentFixture
		p.Status = statuses[n]
		writeJSON(w, 200, p)
	})
	return client, &calls
}

func fastPolling() []fluxapay.PollOption {
	return []fluxapay.PollOption{
		fluxapay.WithPollInterval(time.Millisecond),
		fluxapay.WithMaxPollInterval(5 * time.Millisecond),
	}
}

func TestWaitForPaymentSuccess(t *testing.T) {
	client, calls := statusSequence(t, "pending", "partially_paid", "confirmed")

	var seen []string
	opts := append(fastPolling(), fluxapay.WithOnPoll(func(p *fluxapay.Payment) { seen = append(seen, p.Status) }))
	payment, err := client.WaitForPayment(context.Background(), "pay_123", opts...)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if payment.Status != "confirmed" || payment.ID != "pay_123" {
		t.Errorf("unexpected payment: %+v", payment)
	}
	if got := atomic.LoadInt32(calls); got != 3 {
		t.Errorf("polled %d times, want 3", got)
	}
	if len(seen) != 3 || seen[0] != "pending" || seen[2] != "confirmed" {
		t.Errorf("OnPoll saw %v", seen)
	}
}

func TestWaitForPaymentReturnsImmediatelyWhenAlreadyPaid(t *testing.T) {
	client, calls := statusSequence(t, "completed")

	// A long interval proves the first poll is not delayed.
	payment, err := client.Payments.WaitForPayment(context.Background(), "pay_123", fluxapay.WithPollInterval(time.Hour))
	if err != nil || payment.Status != "completed" {
		t.Fatalf("payment=%+v err=%v", payment, err)
	}
	if got := atomic.LoadInt32(calls); got != 1 {
		t.Errorf("polled %d times, want 1", got)
	}
}

func TestWaitForPaymentFailureStatus(t *testing.T) {
	for _, status := range []string{"expired", "failed", "cancelled"} {
		t.Run(status, func(t *testing.T) {
			client, _ := statusSequence(t, "pending", status)
			payment, err := client.WaitForPayment(context.Background(), "pay_123", fastPolling()...)

			var statusErr *fluxapay.PaymentStatusError
			if !errors.As(err, &statusErr) {
				t.Fatalf("err = %v, want *PaymentStatusError", err)
			}
			if !errors.Is(err, fluxapay.ErrPaymentNotSuccessful) {
				t.Errorf("errors.Is(err, ErrPaymentNotSuccessful) = false")
			}
			if statusErr.Status != status || statusErr.PaymentID != "pay_123" {
				t.Errorf("unexpected error: %+v", statusErr)
			}
			if payment == nil || payment.Status != status {
				t.Errorf("payment = %+v, want final payment with status %q", payment, status)
			}
		})
	}
}

func TestWaitForPaymentCustomStatuses(t *testing.T) {
	client, _ := statusSequence(t, "pending", "settled")
	opts := append(fastPolling(), fluxapay.WithSuccessStatuses("settled"))
	payment, err := client.WaitForPayment(context.Background(), "pay_123", opts...)
	if err != nil || payment.Status != "settled" {
		t.Fatalf("payment=%+v err=%v", payment, err)
	}
}

func TestWaitForPaymentContextTimeout(t *testing.T) {
	client, calls := statusSequence(t, "pending")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	payment, err := client.WaitForPayment(ctx, "pay_123", fastPolling()...)

	if payment != nil {
		t.Errorf("payment = %+v, want nil on timeout", payment)
	}
	var timeoutErr *fluxapay.WaitTimeoutError
	if !errors.As(err, &timeoutErr) {
		t.Fatalf("err = %v, want *WaitTimeoutError", err)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("errors.Is(err, context.DeadlineExceeded) = false")
	}
	if timeoutErr.LastStatus != "pending" {
		t.Errorf("LastStatus = %q, want pending", timeoutErr.LastStatus)
	}
	if atomic.LoadInt32(calls) < 2 {
		t.Errorf("expected several polls before timing out, got %d", atomic.LoadInt32(calls))
	}
}

func TestWaitForPaymentPollTimeoutOption(t *testing.T) {
	client, _ := statusSequence(t, "pending")
	opts := append(fastPolling(), fluxapay.WithPollTimeout(20*time.Millisecond))

	start := time.Now()
	_, err := client.WaitForPayment(context.Background(), "pay_123", opts...)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want deadline exceeded", err)
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("WithPollTimeout not honoured, waited %v", elapsed)
	}
}

func TestWaitForPaymentContextCancelled(t *testing.T) {
	client, _ := statusSequence(t, "pending")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := client.WaitForPayment(ctx, "pay_123", fastPolling()...)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

func TestWaitForPaymentRetriesTransientErrors(t *testing.T) {
	var calls int32
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch atomic.AddInt32(&calls, 1) {
		case 1:
			writeJSON(w, 503, map[string]string{"message": "unavailable"})
		case 2:
			writeJSON(w, 429, map[string]string{"code": "RATE_LIMIT_EXCEEDED", "message": "slow down"})
		default:
			p := paymentFixture
			p.Status = "confirmed"
			writeJSON(w, 200, p)
		}
	})

	payment, err := client.WaitForPayment(context.Background(), "pay_123", fastPolling()...)
	if err != nil || payment.Status != "confirmed" {
		t.Fatalf("payment=%+v err=%v", payment, err)
	}
	if got := atomic.LoadInt32(&calls); got != 3 {
		t.Errorf("polled %d times, want 3", got)
	}
}

func TestWaitForPaymentStopsOnPermanentError(t *testing.T) {
	var calls int32
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		writeJSON(w, 404, map[string]string{"code": "PAYMENT_NOT_FOUND", "message": "Payment not found"})
	})

	_, err := client.WaitForPayment(context.Background(), "pay_123", fastPolling()...)
	var apiErr *fluxapay.Error
	if !errors.As(err, &apiErr) || apiErr.StatusCode != 404 {
		t.Fatalf("err = %v, want 404 *fluxapay.Error", err)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Errorf("polled %d times, want 1 (404 is not transient)", got)
	}
}

func TestWaitForPaymentTimeoutKeepsLastTransientError(t *testing.T) {
	_, client := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 502, map[string]string{"message": "bad gateway"})
	})

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err := client.WaitForPayment(ctx, "pay_123", fastPolling()...)

	var timeoutErr *fluxapay.WaitTimeoutError
	if !errors.As(err, &timeoutErr) {
		t.Fatalf("err = %v, want *WaitTimeoutError", err)
	}
	var apiErr *fluxapay.Error
	if !errors.As(timeoutErr.LastErr, &apiErr) || apiErr.StatusCode != 502 {
		t.Errorf("LastErr = %v, want the last 502", timeoutErr.LastErr)
	}
}

func TestWaitForPaymentRequiresID(t *testing.T) {
	client := fluxapay.New("sk_test")
	if _, err := client.WaitForPayment(context.Background(), " "); !errors.Is(err, fluxapay.ErrInvalidParams) {
		t.Fatalf("err = %v, want ErrInvalidParams", err)
	}
}
