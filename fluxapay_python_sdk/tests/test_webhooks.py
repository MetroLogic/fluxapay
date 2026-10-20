"""Tests for the standalone webhook signature verifier."""

import hashlib
import hmac
import time

import pytest

from fluxapay.webhooks import (
    WebhookSignatureVerificationError,
    verify_signature,
)


def _signature(payload: bytes, timestamp: str, secret: str) -> str:
    signed_payload = timestamp.encode("utf-8") + b"." + payload
    return hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()


def test_verify_signature_accepts_valid_signature():
    payload = b'{"event":"payment.confirmed"}'
    timestamp = str(int(time.time()))
    secret = "whsec_test"
    header = f"t={timestamp},v1={_signature(payload, timestamp, secret)}"

    assert verify_signature(payload, header, secret) is True


def test_verify_signature_accepts_fluxapay_iso_timestamp():
    payload = b'{"event":"payment.confirmed"}'
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    secret = "whsec_test"
    header = f"t={timestamp},v1={_signature(payload, timestamp, secret)}"

    assert verify_signature(payload, header, secret) is True


def test_verify_signature_rejects_invalid_signature():
    timestamp = str(int(time.time()))

    with pytest.raises(WebhookSignatureVerificationError, match="invalid"):
        verify_signature(b"{}", f"t={timestamp},v1=bad-signature", "whsec_test")


def test_verify_signature_rejects_expired_timestamp():
    payload = b"{}"
    timestamp = str(int(time.time()) - 600)
    secret = "whsec_test"
    header = f"t={timestamp},v1={_signature(payload, timestamp, secret)}"

    with pytest.raises(WebhookSignatureVerificationError, match="expired"):
        verify_signature(payload, header, secret, tolerance=300)