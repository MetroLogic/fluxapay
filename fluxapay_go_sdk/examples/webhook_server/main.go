// Command webhook_server starts an HTTP server that receives FluxaPay
// webhooks, verifies their HMAC-SHA256 signature and timestamp, and
// dispatches on the event type.
//
// Usage:
//
//	export FLUXAPAY_WEBHOOK_SECRET=whsec_...
//	go run ./examples/webhook_server
//
// Then point your merchant webhook URL at http://<host>:8080/webhooks/fluxapay.
package main

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

const (
	// maxBodyBytes caps the request body so a hostile client cannot exhaust memory.
	maxBodyBytes = 1 << 20
	// toleranceSeconds rejects deliveries older (or newer) than 5 minutes,
	// which blocks replays of captured requests.
	toleranceSeconds = 300
)

func main() {
	secret := os.Getenv("FLUXAPAY_WEBHOOK_SECRET")
	if secret == "" {
		log.Fatal("FLUXAPAY_WEBHOOK_SECRET is not set (export FLUXAPAY_WEBHOOK_SECRET=whsec_...)")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Webhook verification needs no API key; the client only provides helpers.
	client := fluxapay.New(os.Getenv("FLUXAPAY_API_KEY"))

	mux := http.NewServeMux()
	mux.Handle("/webhooks/fluxapay", webhookHandler(client, secret))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
	}

	// Shut down gracefully on Ctrl+C / SIGTERM so in-flight webhooks finish.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	log.Printf("listening on :%s, POST webhooks to /webhooks/fluxapay", port)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func webhookHandler(client *fluxapay.Client, secret string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Step 1: read the RAW body. The signature covers these exact bytes,
		// so never decode and re-encode JSON before verifying.
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
		if err != nil {
			http.Error(w, "unable to read body", http.StatusBadRequest)
			return
		}

		// Step 2: verify the signature and timestamp headers.
		// Signature = hex(HMAC-SHA256(secret, timestamp + "." + body)).
		signature := r.Header.Get("X-FluxaPay-Signature")
		timestamp := r.Header.Get("X-FluxaPay-Timestamp")
		if !client.Webhooks.Verify(string(raw), signature, timestamp, secret, toleranceSeconds) {
			// 400 tells FluxaPay the delivery was rejected; do not leak why.
			log.Printf("rejected webhook: invalid signature or stale timestamp (ts=%q)", timestamp)
			http.Error(w, "invalid signature", http.StatusBadRequest)
			return
		}

		// Step 3: parse the verified payload.
		event, err := client.Webhooks.Parse(string(raw))
		if err != nil {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}

		// The payment ID is in data.payment_id for payment events.
		paymentID := event.PaymentID
		if id, ok := event.Data["payment_id"].(string); ok && id != "" {
			paymentID = id
		}

		// Step 4: act on the event. Keep this fast: respond 2xx quickly and
		// push slow work (emails, fulfilment) to a queue. Deliveries can be
		// retried, so make handlers idempotent.
		switch event.Event {
		case "payment.confirmed", "payment_confirmed":
			log.Printf("payment %s confirmed: fulfil the order", paymentID)
		case "payment.failed", "payment_failed", "payment.expired", "payment_expired":
			log.Printf("payment %s did not complete (%s): release reserved stock", paymentID, event.Event)
		case "refund.completed", "refund_completed":
			log.Printf("refund completed for payment %s", paymentID)
		default:
			log.Printf("ignoring event %s", event.Event)
		}

		w.WriteHeader(http.StatusOK)
	})
}
