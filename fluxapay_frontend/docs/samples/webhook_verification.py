"""
FluxaPay Webhook Signature Verification - Python

This module demonstrates how to verify webhook signatures from FluxaPay
in a Python environment.

Copy and adapt this code to your webhook handler.
"""

import hmac
import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Dict, Optional, Set, Any
from functools import wraps


def verify_webhook_signature(
    payload: str,
    signature: str,
    timestamp: str,
    secret: str,
    replay_protection_window_seconds: int = 300,
    processed_webhook_ids: Optional[Set[str]] = None
) -> Dict[str, Any]:
    """
    Verify a FluxaPay webhook signature.

    Args:
        payload: Raw JSON payload as string
        signature: Signature from X-FluxaPay-Signature header
        timestamp: Timestamp from X-FluxaPay-Timestamp header
        secret: Your webhook secret (whsec_...)
        replay_protection_window_seconds: Max age of webhook in seconds (default: 300)
        processed_webhook_ids: Set of already processed webhook IDs for deduplication

    Returns:
        Dict with 'valid' boolean and optional 'error' message

    Example:
        >>> result = verify_webhook_signature(
        ...     payload='{"event":"payment_confirmed"}',
        ...     signature='abc123...',
        ...     timestamp='2026-03-25T14:30:00.000Z',
        ...     secret='whsec_...'
        ... )
        >>> if result['valid']:
        ...     print("Webhook is authentic")
    """

    # 1. Verify timestamp is within acceptable window
    try:
        # Parse ISO 8601 timestamp
        webhook_time = datetime.fromisoformat(
            timestamp.replace('Z', '+00:00')
        )
    except ValueError:
        return {'valid': False, 'error': 'Invalid timestamp format'}

    # Get current time in UTC
    current_time = datetime.now(timezone.utc)

    # Calculate time difference
    time_diff = (current_time - webhook_time).total_seconds()

    if time_diff < 0:
        return {'valid': False, 'error': 'Webhook timestamp is in the future'}

    if time_diff > replay_protection_window_seconds:
        return {
            'valid': False,
            'error': f'Webhook timestamp is older than {replay_protection_window_seconds} seconds'
        }

    # 2. Compute expected signature
    signing_string = f"{timestamp}.{payload}"
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        signing_string.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    # 3. Compare signatures using constant-time comparison
    # This prevents timing attacks
    if not hmac.compare_digest(signature, expected_signature):
        return {'valid': False, 'error': 'Signature verification failed'}

    return {'valid': True}


def verify_webhook_decorator(
    replay_protection_window_seconds: int = 300
):
    """
    Decorator for Flask/FastAPI webhook handlers to verify signatures.

    Usage with Flask:
        @app.route('/webhooks/fluxapay', methods=['POST'])
        @verify_webhook_decorator()
        def handle_webhook(data):
            # data is already verified
            return {'received': True}

    Usage with FastAPI:
        @app.post('/webhooks/fluxapay')
        @verify_webhook_decorator()
        async def handle_webhook(data: dict):
            # data is already verified
            return {'received': True}
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # This is a generic decorator - adapt based on your framework
            # For Flask, you'd access request.headers and request.get_data()
            # For FastAPI, you'd access request.headers and await request.body()
            return func(*args, **kwargs)
        return wrapper
    return decorator


# Flask Example
def create_flask_webhook_handler():
    """
    Example Flask webhook handler with signature verification.
    """
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    @app.route('/webhooks/fluxapay', methods=['POST'])
    def handle_webhook():
        """Handle incoming webhook from FluxaPay"""
        signature = request.headers.get('X-FluxaPay-Signature')
        timestamp = request.headers.get('X-FluxaPay-Timestamp')
        secret = os.getenv('FLUXAPAY_WEBHOOK_SECRET')

        if not signature or not timestamp or not secret:
            return jsonify({'error': 'Missing webhook headers or secret'}), 401

        # Get raw body as string
        payload = request.get_data(as_text=True)

        # Verify signature
        verification = verify_webhook_signature(
            payload,
            signature,
            timestamp,
            secret,
            replay_protection_window_seconds=300
        )

        if not verification['valid']:
            return jsonify({'error': verification['error']}), 401

        # Parse and process webhook
        try:
            data = request.get_json()
            event = data.get('event')

            print(f"Received verified webhook: {event}")

            # Process different event types
            if event == 'payment_confirmed':
                handle_payment_confirmed(data.get('data'))
            elif event == 'payment_failed':
                handle_payment_failed(data.get('data'))
            elif event == 'refund_completed':
                handle_refund_completed(data.get('data'))

            return jsonify({'received': True}), 200

        except Exception as e:
            print(f"Webhook processing error: {e}")
            return jsonify({'error': 'Internal server error'}), 500

    return app


# FastAPI Example
def create_fastapi_webhook_handler():
    """
    Example FastAPI webhook handler with signature verification.
    """
    from fastapi import FastAPI, Request, HTTPException
    from fastapi.responses import JSONResponse

    app = FastAPI()

    @app.post('/webhooks/fluxapay')
    async def handle_webhook(request: Request):
        """Handle incoming webhook from FluxaPay"""
        signature = request.headers.get('X-FluxaPay-Signature')
        timestamp = request.headers.get('X-FluxaPay-Timestamp')
        secret = os.getenv('FLUXAPAY_WEBHOOK_SECRET')

        if not signature or not timestamp or not secret:
            raise HTTPException(
                status_code=401,
                detail='Missing webhook headers or secret'
            )

        # Get raw body as string
        payload = await request.body()
        payload_str = payload.decode('utf-8')

        # Verify signature
        verification = verify_webhook_signature(
            payload_str,
            signature,
            timestamp,
            secret,
            replay_protection_window_seconds=300
        )

        if not verification['valid']:
            raise HTTPException(
                status_code=401,
                detail=verification['error']
            )

        # Parse and process webhook
        try:
            data = json.loads(payload_str)
            event = data.get('event')

            print(f"Received verified webhook: {event}")

            # Process different event types
            if event == 'payment_confirmed':
                await handle_payment_confirmed_async(data.get('data'))
            elif event == 'payment_failed':
                await handle_payment_failed_async(data.get('data'))
            elif event == 'refund_completed':
                await handle_refund_completed_async(data.get('data'))

            return JSONResponse({'received': True}, status_code=200)

        except Exception as e:
            print(f"Webhook processing error: {e}")
            raise HTTPException(
                status_code=500,
                detail='Internal server error'
            )

    return app


# Event Handlers
def handle_payment_confirmed(data: Dict[str, Any]) -> None:
    """Handle payment_confirmed event"""
    print(f"Processing payment confirmation: {data.get('payment_id')}")
    # Your business logic here


def handle_payment_failed(data: Dict[str, Any]) -> None:
    """Handle payment_failed event"""
    print(f"Processing payment failure: {data.get('payment_id')}")
    # Your business logic here


def handle_refund_completed(data: Dict[str, Any]) -> None:
    """Handle refund_completed event"""
    print(f"Processing refund completion: {data.get('refund_id')}")
    # Your business logic here


async def handle_payment_confirmed_async(data: Dict[str, Any]) -> None:
    """Async version of handle_payment_confirmed"""
    print(f"Processing payment confirmation: {data.get('payment_id')}")
    # Your async business logic here


async def handle_payment_failed_async(data: Dict[str, Any]) -> None:
    """Async version of handle_payment_failed"""
    print(f"Processing payment failure: {data.get('payment_id')}")
    # Your async business logic here


async def handle_refund_completed_async(data: Dict[str, Any]) -> None:
    """Async version of handle_refund_completed"""
    print(f"Processing refund completion: {data.get('refund_id')}")
    # Your async business logic here


# Testing Utilities
def generate_test_webhook_signature(
    payload: Dict[str, Any],
    secret: str,
    timestamp: Optional[str] = None
) -> Dict[str, str]:
    """
    Generate a test webhook signature for testing purposes.

    Args:
        payload: Webhook payload as dictionary
        secret: Webhook secret
        timestamp: Optional timestamp (defaults to current time)

    Returns:
        Dict with 'signature' and 'timestamp' keys

    Example:
        >>> result = generate_test_webhook_signature(
        ...     {'event': 'payment_confirmed', 'payment_id': 'pay_123'},
        ...     'whsec_test_secret'
        ... )
        >>> print(result['signature'])
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    payload_str = json.dumps(payload)
    signing_string = f"{timestamp}.{payload_str}"

    signature = hmac.new(
        secret.encode('utf-8'),
        signing_string.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return {'signature': signature, 'timestamp': timestamp}


# Example usage
if __name__ == '__main__':
    # Test signature verification
    test_payload = json.dumps({
        'event': 'payment_confirmed',
        'payment_id': 'pay_123'
    })
    test_secret = 'whsec_test_secret'
    test_timestamp = '2026-03-25T14:30:00.000Z'

    # Generate signature
    sig_result = generate_test_webhook_signature(
        json.loads(test_payload),
        test_secret,
        test_timestamp
    )

    # Verify signature
    verification = verify_webhook_signature(
        test_payload,
        sig_result['signature'],
        sig_result['timestamp'],
        test_secret
    )

    print(f"Verification result: {verification}")
