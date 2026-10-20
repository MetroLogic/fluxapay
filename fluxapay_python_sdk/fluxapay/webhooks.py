"""Webhook signature verification helpers for FluxaPay integrations."""

from __future__ import annotations

import hashlib
import hmac
import time
from datetime import datetime
from typing import List, Union


class WebhookSignatureVerificationError(ValueError):
    """Raised when a webhook signature is malformed, invalid, or expired."""


def _timestamp_seconds(value: str) -> float:
    try:
        return float(value)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise WebhookSignatureVerificationError(
                "Webhook signature timestamp is invalid"
            ) from error
        if parsed.tzinfo is None:
            raise WebhookSignatureVerificationError(
                "Webhook signature timestamp must include a timezone"
            )
        return parsed.timestamp()


def verify_signature(
    payload: Union[str, bytes],
    signature_header: str,
    secret: str,
    tolerance: int = 300,
) -> bool:
    """Verify a FluxaPay webhook using its ``t=...,v1=...`` signature header.

    ``payload`` must be the raw request body; parsing and re-serializing JSON can
    change its bytes and invalidate the signature. The timestamp can be Unix
    seconds or ISO-8601, matching FluxaPay's timestamp header format.

    FastAPI example::

        from fastapi import Request
        from fluxapay.webhooks import verify_signature

        async def webhook(request: Request):
            body = await request.body()
            verify_signature(
                body,
                request.headers["X-FluxaPay-Signature"],
                "whsec_...",
            )

    Flask example::

        from flask import request
        from fluxapay.webhooks import verify_signature

        @app.post("/webhook")
        def webhook():
            verify_signature(
                request.get_data(),
                request.headers["X-FluxaPay-Signature"],
                "whsec_...",
            )

    Returns ``True`` for a valid signature. Raises
    :class:`WebhookSignatureVerificationError` for malformed headers, invalid
    signatures, or timestamps outside ``tolerance`` seconds.
    """
    if not secret:
        raise WebhookSignatureVerificationError("Webhook secret is required")
    if tolerance < 0:
        raise ValueError("tolerance must be non-negative")

    timestamp: str | None = None
    signatures: List[str] = []
    for part in signature_header.split(","):
        key, separator, value = part.strip().partition("=")
        if not separator or not value:
            continue
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)

    if timestamp is None or not signatures:
        raise WebhookSignatureVerificationError(
            "Webhook signature header must contain t and v1 values"
        )

    timestamp_seconds = _timestamp_seconds(timestamp)
    if abs(time.time() - timestamp_seconds) > tolerance:
        raise WebhookSignatureVerificationError("Webhook signature timestamp has expired")

    body = payload.encode("utf-8") if isinstance(payload, str) else payload
    signed_payload = timestamp.encode("utf-8") + b"." + body
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, signature) for signature in signatures):
        raise WebhookSignatureVerificationError("Webhook signature is invalid")

    return True


__all__ = ["WebhookSignatureVerificationError", "verify_signature"]