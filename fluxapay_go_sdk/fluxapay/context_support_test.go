package fluxapay

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func slowServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
}

func TestGetReturnsContextCanceled(t *testing.T) {
	srv := slowServer()
	defer srv.Close()
	c := New("k", WithBaseURL(srv.URL))

	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(20 * time.Millisecond); cancel() }()

	start := time.Now()
	_, err := c.Payments.Get(ctx, "pay_1")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("request did not return promptly after cancel")
	}
}

func TestGetReturnsDeadlineExceeded(t *testing.T) {
	srv := slowServer()
	defer srv.Close()
	c := New("k", WithBaseURL(srv.URL))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	_, err := c.Payments.Get(ctx, "pay_1")
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected context.DeadlineExceeded, got %v", err)
	}
}
