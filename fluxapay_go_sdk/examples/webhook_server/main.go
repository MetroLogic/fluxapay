// webhook_server receives FluxaPay webhooks on POST /webhooks/fluxapay,
// verifies their signature, and reacts to payment events.
//
//	FLUXAPAY_WEBHOOK_SECRET=whsec_... go run ./examples/webhook_server
//
// The same handler works in Gin: wrap it with gin.WrapF(handleWebhook).
package main

import (
	"io"
	"log"
	"net/http"
	"os"

	fluxapay "github.com/MetroLogic/fluxapay/fluxapay_go_sdk/fluxapay"
)

// The client is only used for its webhook helpers here, so no API key is needed.
var webhooks = fluxapay.New("").Webhooks

func main() {
	secret := os.Getenv("FLUXAPAY_WEBHOOK_SECRET")
	if secret == "" {
		log.Fatal("set FLUXAPAY_WEBHOOK_SECRET (Dashboard → Settings → Webhooks)")
	}
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}

	http.HandleFunc("/webhooks/fluxapay", func(w http.ResponseWriter, r *http.Request) {
		handleWebhook(w, r, secret)
	})
	log.Printf("listening on %s/webhooks/fluxapay", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func handleWebhook(w http.ResponseWriter, r *http.Request, secret string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 1. Read the raw body. The signature covers these exact bytes, so verify
	//    before decoding JSON. Cap the size so a large body can't exhaust memory.
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}

	// 2. Verify the HMAC-SHA256 signature and the timestamp (5-minute window
	//    against replays).
	signature := r.Header.Get("X-FluxaPay-Signature")
	timestamp := r.Header.Get("X-FluxaPay-Timestamp")
	if !webhooks.Verify(string(raw), signature, timestamp, secret, 300) {
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}

	// 3. Decode the event.
	event, err := webhooks.Parse(string(raw))
	if err != nil {
		http.Error(w, "bad payload", http.StatusBadRequest)
		return
	}

	// 4. React to it. Keep this fast and idempotent: FluxaPay retries on
	//    non-2xx responses, so the same event can arrive more than once.
	switch event.Event {
	case "payment.confirmed":
		log.Printf("payment %s confirmed — fulfil the order", event.PaymentID)
	case "payment.failed", "payment.expired":
		log.Printf("payment %s did not complete (%s)", event.PaymentID, event.Event)
	default:
		log.Printf("ignoring %s for %s", event.Event, event.PaymentID)
	}

	// 5. Acknowledge with 2xx so the delivery is not retried.
	w.WriteHeader(http.StatusNoContent)
}
