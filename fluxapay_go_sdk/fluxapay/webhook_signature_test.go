package fluxapay

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"testing"
	"time"
)

func signHeader(payload []byte, secret string, at time.Time) string {
	ts := strconv.FormatInt(at.Unix(), 10)
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(ts + "."))
	m.Write(payload)
	return "t=" + ts + ",v1=" + hex.EncodeToString(m.Sum(nil))
}

func TestVerifyWebhookSignature(t *testing.T) {
	body := []byte(`{"event":"payment.confirmed"}`)
	secret := "whsec_test"
	now := time.Now()

	if err := VerifyWebhookSignature(body, signHeader(body, secret, now), secret, 0); err != nil {
		t.Fatalf("valid: %v", err)
	}
	h := signHeader(body, secret, now)
	bad := h[:len(h)-1] + "0"
	if h[len(h)-1] == '0' {
		bad = h[:len(h)-1] + "1"
	}
	if err := VerifyWebhookSignature(body, bad, secret, time.Minute); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("corrupted: %v", err)
	}
	if err := VerifyWebhookSignature([]byte("tampered"), h, secret, time.Minute); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("tampered: %v", err)
	}
	old := signHeader(body, secret, now.Add(-10*time.Minute))
	if err := VerifyWebhookSignature(body, old, secret, 5*time.Minute); !errors.Is(err, ErrExpiredTimestamp) {
		t.Fatalf("replay: %v", err)
	}
	for _, hdr := range []string{"", "garbage", "t=abc,v1=ff", "v1=ff", "t=123"} {
		if err := VerifyWebhookSignature(body, hdr, secret, time.Minute); !errors.Is(err, ErrInvalidHeader) {
			t.Fatalf("header %q: %v", hdr, err)
		}
	}
}
