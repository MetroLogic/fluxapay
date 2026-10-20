"""Command line helper: ``fluxapay ping`` and ``fluxapay verify-webhook``."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import sys
import time
from typing import List, Optional

import httpx

DEFAULT_BASE_URL = "https://api.fluxapay.com"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="fluxapay", description="FluxaPay developer utilities")
    sub = p.add_subparsers(dest="command", required=True)

    ping = sub.add_parser("ping", help="Validate an API key and check gateway health")
    ping.add_argument("--api-key", required=True, help="FluxaPay API key")
    ping.add_argument("--base-url", default=DEFAULT_BASE_URL, help="API base URL")
    ping.add_argument("--timeout", type=float, default=10.0, help="Request timeout (seconds)")

    vw = sub.add_parser("verify-webhook", help="Verify a webhook signature locally")
    vw.add_argument("--secret", required=True, help="Webhook secret (whsec_...)")
    vw.add_argument("--header", required=True, help="Signature header, e.g. 't=123,v1=abc'")
    vw.add_argument("--payload", required=True, help="Path to file containing the raw body")
    vw.add_argument("--tolerance", type=int, default=300, help="Tolerance in seconds")
    return p


def cmd_ping(args: argparse.Namespace) -> int:
    base = args.base_url.rstrip("/")
    try:
        with httpx.Client(base_url=base, timeout=args.timeout) as c:
            health = c.get("/v1/health")
            me = c.get("/v1/merchants/me", headers={"Authorization": f"Bearer {args.api_key}"})
    except httpx.HTTPError as exc:
        print(f"FAIL  could not reach {base}: {exc}")
        return 1
    print(f"Health: {'ok' if health.status_code < 400 else 'down'} ({health.status_code})")
    if me.status_code >= 400:
        print(f"FAIL  credentials rejected (HTTP {me.status_code})")
        return 1
    body = me.json()
    data = body.get("data", body) if isinstance(body, dict) else {}
    name = data.get("business_name") or data.get("name") or "unknown"
    status = data.get("status", "unknown")
    print(f"OK    account: {name}  status: {status}")
    return 0


def _check(payload: bytes, header: str, secret: str, tolerance: int) -> str:
    """Return 'ok' or an error description."""
    parts = dict(p.strip().split("=", 1) for p in header.split(",") if "=" in p)
    if "t" not in parts or "v1" not in parts:
        return "invalid header (expected t=<ts>,v1=<sig>)"
    try:
        ts = int(parts["t"])
    except ValueError:
        return "invalid header timestamp"
    if abs(time.time() - ts) > tolerance:
        return "timestamp outside tolerance window"
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, parts["v1"]):
        return "signature mismatch"
    return "ok"


def cmd_verify_webhook(args: argparse.Namespace) -> int:
    try:
        with open(args.payload, "rb") as f:
            payload = f.read()
    except OSError as exc:
        print(f"FAIL  cannot read payload: {exc}")
        return 1
    result = _check(payload, args.header, args.secret, args.tolerance)
    if result == "ok":
        print("OK    signature valid")
        return 0
    print(f"FAIL  {result}")
    return 1


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    code = cmd_ping(args) if args.command == "ping" else cmd_verify_webhook(args)
    return code


if __name__ == "__main__":
    sys.exit(main())
