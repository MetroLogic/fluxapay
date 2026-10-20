import hashlib
import hmac
import time

import httpx
import pytest

from fluxapay import cli


def test_parser_requires_command():
    with pytest.raises(SystemExit):
        cli.build_parser().parse_args([])


def test_parser_ping_args():
    a = cli.build_parser().parse_args(["ping", "--api-key", "k"])
    assert a.command == "ping" and a.api_key == "k"


def test_ping_success(monkeypatch, capsys):
    def handler(request):
        if request.url.path == "/v1/health":
            return httpx.Response(200, json={"status": "ok"})
        return httpx.Response(200, json={"business_name": "Acme", "status": "active"})

    real = httpx.Client
    monkeypatch.setattr(
        cli.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    )
    assert cli.main(["ping", "--api-key", "k"]) == 0
    assert "Acme" in capsys.readouterr().out


def test_ping_bad_key(monkeypatch):
    def handler(request):
        return httpx.Response(200 if request.url.path == "/v1/health" else 401)

    real = httpx.Client
    monkeypatch.setattr(
        cli.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    )
    assert cli.main(["ping", "--api-key", "bad"]) == 1


def _header(body: bytes, secret: str, ts: int) -> str:
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def test_verify_webhook(tmp_path):
    f = tmp_path / "p.json"
    f.write_bytes(b'{"a":1}')
    good = _header(b'{"a":1}', "s", int(time.time()))
    assert cli.main(["verify-webhook", "--secret", "s", "--header", good, "--payload", str(f)]) == 0
    assert cli.main(["verify-webhook", "--secret", "x", "--header", good, "--payload", str(f)]) == 1
    old = _header(b'{"a":1}', "s", int(time.time()) - 1000)
    assert cli.main(["verify-webhook", "--secret", "s", "--header", old, "--payload", str(f)]) == 1
