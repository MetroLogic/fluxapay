package fluxapay

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
)

// DefaultWebhookTolerance is the default replay-protection window.
const DefaultWebhookTolerance = 5 * time.Minute

// Typed errors returned by VerifyWebhookSignature.
var (
	ErrInvalidHeader    = errors.New("fluxapay: invalid webhook signature header")
	ErrExpiredTimestamp = errors.New("fluxapay: webhook timestamp outside tolerance window")
	ErrInvalidSignature = errors.New("fluxapay: webhook signature mismatch")
)

// VerifyWebhookSignature verifies a header of the form "t=<unix>,v1=<hex>".
// The expected signature is HMAC-SHA256(secret, t + "." + payload). A
// tolerance <= 0 uses DefaultWebhookTolerance.
func VerifyWebhookSignature(payload []byte, header string, secret string, tolerance time.Duration) error {
	if tolerance <= 0 {
		tolerance = DefaultWebhookTolerance
	}
	var ts string
	var sigs []string
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			return ErrInvalidHeader
		}
		switch kv[0] {
		case "t":
			ts = kv[1]
		case "v1":
			sigs = append(sigs, kv[1])
		}
	}
	if ts == "" || len(sigs) == 0 {
		return ErrInvalidHeader
	}
	secs, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return ErrInvalidHeader
	}
	diff := time.Since(time.Unix(secs, 0))
	if diff < 0 {
		diff = -diff
	}
	if diff > tolerance {
		return ErrExpiredTimestamp
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "."))
	mac.Write(payload)
	expected := []byte(hex.EncodeToString(mac.Sum(nil)))
	for _, s := range sigs {
		if subtle.ConstantTimeCompare(expected, []byte(s)) == 1 {
			return nil
		}
	}
	return ErrInvalidSignature
}
