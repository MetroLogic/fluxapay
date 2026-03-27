"use client";

import React, { useState, useEffect } from "react";
import {
  Copy,
  Check,
  Code,
  FileJson,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  Terminal,
  Braces,
  Shield,
} from "lucide-react";
import { api } from "@/lib/api";
import { DOCS_URLS } from "@/lib/docs";

type Lang = "curl" | "js" | "python";
type Endpoint = "create" | "fetch" | "list" | "webhook";

const TABS = [
  { id: "curl" as Lang, label: "cURL", Icon: Terminal },
  { id: "js" as Lang, label: "JavaScript", Icon: Braces },
  { id: "python" as Lang, label: "Python", Icon: Code },
];

const ENDPOINTS: { id: Endpoint; label: string }[] = [
  { id: "create", label: "Create Payment" },
  { id: "fetch", label: "Fetch Payment" },
  { id: "list", label: "List Payments" },
  { id: "webhook", label: "Webhook Verification" },
];

// ─── Code block with copy button ────────────────────────────────────────────
function CodeBlock({
  code,
  id,
  copied,
  onCopy,
}: {
  code: string;
  id: string;
  copied: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          backgroundColor: "#1a1a3e",
          borderColor: "#3d3d6b",
          borderWidth: "1px",
          borderRadius: "0.5rem",
          padding: "1rem",
          overflowX: "auto",
        }}
      >
        <pre
          style={{
            color: "#e0e0ff",
            fontFamily: "monospace",
            fontSize: "0.8125rem",
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
          }}
        >
          {code}
        </pre>
      </div>
      <button
        onClick={() => onCopy(code, id)}
        aria-label="Copy code"
        style={{
          marginTop: "0.5rem",
          padding: "0.375rem 0.875rem",
          borderRadius: "0.375rem",
          backgroundColor: "#fbbf24",
          color: "#1a1a3e",
          border: "none",
          cursor: "pointer",
          fontSize: "0.8125rem",
          fontWeight: "600",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          transition: "background-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f59e0b";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fbbf24";
        }}
      >
        {copied === id ? (
          <><Check size={14} /> Copied!</>
        ) : (
          <><Copy size={14} /> Copy</>
        )}
      </button>
    </div>
  );
}

// ─── Code generators ─────────────────────────────────────────────────────────
function getCreatePayment(lang: Lang, baseUrl: string, apiKey: string): string {
  const body = {
    amount: 100,
    currency: "USDC",
    customer_email: "customer@example.com",
    success_url: "https://yoursite.com/success",
    cancel_url: "https://yoursite.com/cancel",
    metadata: { order_id: "order_123", cart_id: "987" },
  };

  if (lang === "curl") {
    return `curl -X POST ${baseUrl}/api/v1/payments \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
  }
  if (lang === "js") {
    return `const response = await fetch('${baseUrl}/api/v1/payments', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${JSON.stringify(body, null, 2)}),
});

const payment = await response.json();
console.log(payment.id); // pay_abc123...`;
  }
  return `import requests

response = requests.post(
    "${baseUrl}/api/v1/payments",
    headers={
        "Authorization": "Bearer ${apiKey}",
        "Content-Type": "application/json",
    },
    json=${JSON.stringify(body, null, 4).replace(/"/g, '"')},
)

payment = response.json()
print(payment["id"])  # pay_abc123...`;
}

function getCreatePaymentResponse(): string {
  return `{
  "id": "pay_abc123def456",
  "amount": 100,
  "currency": "USDC",
  "status": "pending",
  "checkout_url": "https://pay.fluxapay.com/pay_abc123def456",
  "stellar_address": "GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DUIISGASGESG6DKFS",
  "customer_email": "customer@example.com",
  "metadata": {
    "order_id": "order_123",
    "cart_id": "987"
  },
  "expires_at": "2026-03-27T15:00:00.000Z",
  "created_at": "2026-03-27T14:45:00.000Z"
}`;
}

function getFetchPayment(lang: Lang, baseUrl: string, apiKey: string): string {
  const url = `${baseUrl}/api/v1/payments/pay_abc123def456`;
  if (lang === "curl") {
    return `curl -X GET ${url} \\
  -H "Authorization: Bearer ${apiKey}"`;
  }
  if (lang === "js") {
    return `const response = await fetch('${url}', {
  headers: {
    'Authorization': 'Bearer ${apiKey}',
  },
});

const payment = await response.json();
console.log(payment.status); // "paid"`;
  }
  return `import requests

response = requests.get(
    "${url}",
    headers={"Authorization": "Bearer ${apiKey}"},
)

payment = response.json()
print(payment["status"])  # "paid"`;
}

function getFetchPaymentResponse(): string {
  return `{
  "id": "pay_abc123def456",
  "amount": 100,
  "currency": "USDC",
  "status": "paid",
  "checkout_url": "https://pay.fluxapay.com/pay_abc123def456",
  "stellar_address": "GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DUIISGASGESG6DKFS",
  "transaction_hash": "a1b2c3d4e5f6...",
  "customer_email": "customer@example.com",
  "metadata": { "order_id": "order_123" },
  "confirmed_at": "2026-03-27T14:47:12.000Z",
  "created_at": "2026-03-27T14:45:00.000Z"
}`;
}

function getListPayments(lang: Lang, baseUrl: string, apiKey: string): string {
  const url = `${baseUrl}/api/v1/payments?page=1&limit=10&status=paid&currency=USDC`;
  if (lang === "curl") {
    return `curl -X GET "${url}" \\
  -H "Authorization: Bearer ${apiKey}"`;
  }
  if (lang === "js") {
    return `const params = new URLSearchParams({
  page: '1',
  limit: '10',
  status: 'paid',
  currency: 'USDC',
});

const response = await fetch(
  \`${baseUrl}/api/v1/payments?\${params}\`,
  {
    headers: { 'Authorization': 'Bearer ${apiKey}' },
  }
);

const { data } = await response.json();
console.log(data.payments);      // array of payments
console.log(data.pagination);    // { page, limit, total, total_pages }`;
  }
  return `import requests

response = requests.get(
    "${baseUrl}/api/v1/payments",
    headers={"Authorization": "Bearer ${apiKey}"},
    params={"page": 1, "limit": 10, "status": "paid", "currency": "USDC"},
)

result = response.json()
print(result["data"]["payments"])    # list of payments
print(result["data"]["pagination"])  # page info`;
}

function getListPaymentsResponse(): string {
  return `{
  "data": {
    "payments": [
      {
        "id": "pay_abc123def456",
        "amount": 100,
        "currency": "USDC",
        "status": "paid",
        "customer_email": "customer@example.com",
        "created_at": "2026-03-27T14:45:00.000Z"
      },
      {
        "id": "pay_xyz789ghi012",
        "amount": 250,
        "currency": "USDC",
        "status": "paid",
        "customer_email": "buyer2@example.com",
        "created_at": "2026-03-26T10:20:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 42,
      "total_pages": 5
    }
  }
}`;
}

function getWebhookVerification(lang: Lang): string {
  if (lang === "curl") {
    return `# FluxaPay signs every webhook with HMAC-SHA256.
# Headers sent with each delivery:
#   X-FluxaPay-Signature  — hex-encoded HMAC-SHA256
#   X-FluxaPay-Timestamp  — ISO 8601 timestamp
#
# Signing string: "\${timestamp}.\${raw_json_body}"
#
# Verify with openssl (for testing):
TIMESTAMP="2026-03-27T14:47:00.000Z"
PAYLOAD='{"event":"payment_confirmed","data":{"payment_id":"pay_abc123def456","amount":100}}'
SECRET="whsec_your_webhook_secret"

EXPECTED=$(echo -n "\${TIMESTAMP}.\${PAYLOAD}" \\
  | openssl dgst -sha256 -hmac "\${SECRET}" -hex | cut -d' ' -f2)

echo "Expected signature: \${EXPECTED}"`;
  }
  if (lang === "js") {
    return `import crypto from 'crypto';
import express from 'express';

const app = express();

// IMPORTANT: use raw body — do NOT parse JSON before verifying
app.post(
  '/webhooks/fluxapay',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-fluxapay-signature'];
    const timestamp  = req.headers['x-fluxapay-timestamp'];
    const secret     = process.env.FLUXAPAY_WEBHOOK_SECRET;

    if (!signature || !timestamp || !secret) {
      return res.status(401).json({ error: 'Missing headers' });
    }

    // Reject webhooks older than 5 minutes (replay protection)
    const ageSec = (Date.now() - new Date(timestamp).getTime()) / 1000;
    if (ageSec > 300) return res.status(401).json({ error: 'Stale webhook' });

    // Recompute HMAC-SHA256 over "\${timestamp}.\${rawBody}"
    const signingString = \`\${timestamp}.\${req.body.toString()}\`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(signingString)
      .digest('hex');

    // Constant-time comparison prevents timing attacks
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature as string),
      Buffer.from(expected),
    );
    if (!valid) return res.status(401).json({ error: 'Invalid signature' });

    const event = JSON.parse(req.body.toString());
    console.log('Verified event:', event.event, event.data.payment_id);

    res.json({ received: true });
  }
);`;
  }
  return `import hashlib
import hmac
import json
from datetime import datetime, timezone
from flask import Flask, request, abort

app = Flask(__name__)

WEBHOOK_SECRET = "whsec_your_webhook_secret"
REPLAY_WINDOW_SECONDS = 300

@app.post("/webhooks/fluxapay")
def handle_webhook():
    signature = request.headers.get("X-FluxaPay-Signature", "")
    timestamp  = request.headers.get("X-FluxaPay-Timestamp", "")
    raw_body   = request.get_data()  # raw bytes — do NOT use request.json

    # Replay protection
    webhook_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    age = (datetime.now(timezone.utc) - webhook_time).total_seconds()
    if age > REPLAY_WINDOW_SECONDS:
        abort(401, "Stale webhook")

    # Recompute HMAC-SHA256 over "\${timestamp}.\${raw_body}"
    signing_string = f"{timestamp}.{raw_body.decode()}"
    expected = hmac.new(
        WEBHOOK_SECRET.encode(),
        signing_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    # Constant-time comparison
    if not hmac.compare_digest(signature, expected):
        abort(401, "Invalid signature")

    event = json.loads(raw_body)
    print(f"Verified event: {event['event']} — {event['data']['payment_id']}")

    return {"received": True}`;
}

function getWebhookPayload(): string {
  return `// Webhook payload delivered to your endpoint
{
  "event": "payment_confirmed",
  "data": {
    "payment_id": "pay_abc123def456",
    "amount": 100,
    "currency": "USDC",
    "status": "paid",
    "customer_email": "customer@example.com",
    "transaction_hash": "a1b2c3d4e5f6...",
    "confirmed_at": "2026-03-27T14:47:12.000Z"
  }
}

// Other event types:
// "payment_failed"   — payment expired or rejected
// "payment_pending"  — awaiting on-chain confirmation
// "refund_completed" — refund processed successfully
// "refund_failed"    — refund could not be processed`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DevelopersPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [activeTab, setActiveTab] = useState<Lang>("curl");
  const [activeEndpoint, setActiveEndpoint] = useState<Endpoint>("create");
  const [apiKey, setApiKey] = useState("Loading...");

  useEffect(() => {
    api.merchant
      .getMe()
      .then((r) => setApiKey(r.merchant.api_key || "No API key generated"))
      .catch(() => setApiKey("Failed to load API key"));
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const baseUrl = testMode
    ? "https://sandbox-api.fluxapay.com"
    : "https://api.fluxapay.com";

  // Derive request / response for the active endpoint + language
  const requestCode = (() => {
    switch (activeEndpoint) {
      case "create":  return getCreatePayment(activeTab, baseUrl, apiKey);
      case "fetch":   return getFetchPayment(activeTab, baseUrl, apiKey);
      case "list":    return getListPayments(activeTab, baseUrl, apiKey);
      case "webhook": return getWebhookVerification(activeTab);
    }
  })();

  const responseCode = (() => {
    switch (activeEndpoint) {
      case "create":  return getCreatePaymentResponse();
      case "fetch":   return getFetchPaymentResponse();
      case "list":    return getListPaymentsResponse();
      case "webhook": return getWebhookPayload();
    }
  })();

  // ── Shared style tokens ──────────────────────────────────────────────────
  const card: React.CSSProperties = {
    borderColor: "#3d3d6b",
    borderWidth: "1px",
    borderStyle: "solid",
    borderRadius: "0.5rem",
    backgroundColor: "#ffffff",
    padding: "1.5rem",
  };

  return (
    <div style={{ backgroundColor: "#ffffff", color: "#1a1a3e" }} className="min-h-screen">
      {/* ── Header ── */}
      <header
        style={{
          backgroundImage: "linear-gradient(to right, #ffffff, #f9fafb)",
          borderBottom: "1px solid #e5e7eb",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "1.5rem 1rem" }}>
          <h1
            style={{
              fontSize: "clamp(1.875rem, 5vw, 2.25rem)",
              fontWeight: "bold",
              background: "linear-gradient(to right, #fbbf24, #f59e0b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: "0.5rem",
            }}
          >
            Developer Portal
          </h1>
          <p style={{ color: "#6b7280", fontSize: "1.125rem" }}>
            Integrate with our API in minutes. Get started with comprehensive documentation and examples.
          </p>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ maxWidth: "80rem", margin: "0 auto", padding: "3rem 1rem" }}>
        {/* Top 3-col grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "2rem",
          }}
        >
          {/* API Key */}
          <section style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <Code style={{ width: "2rem", height: "2rem", color: "#fbbf24" }} />
              <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#1a1a3e" }}>API Key</h2>
            </div>

            <label style={{ display: "block", marginBottom: "0.5rem", color: "#1a1a3e", fontWeight: 500, fontSize: "0.875rem" }}>
              Your {testMode ? "Sandbox" : "Live"} API Key
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                readOnly
                style={{
                  flex: 1,
                  backgroundColor: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.5rem",
                  padding: "0.75rem 1rem",
                  color: "#1a1a3e",
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                  outline: "none",
                }}
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                style={{ padding: "0.75rem", backgroundColor: "#e5e7eb", border: "1px solid #d1d5db", borderRadius: "0.5rem", cursor: "pointer" }}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                onClick={() => copyToClipboard(apiKey, "apikey")}
                aria-label="Copy API key"
                style={{ padding: "0.75rem", backgroundColor: "#fbbf24", border: "none", borderRadius: "0.5rem", cursor: "pointer" }}
              >
                {copied === "apikey" ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <div style={{ backgroundColor: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "0.5rem", padding: "0.875rem", marginBottom: "1.5rem" }}>
              <p style={{ fontSize: "0.875rem", color: "#92400e", lineHeight: 1.5 }}>
                ⚠️ Keep your API key secret. Never share it publicly or commit it to version control.
              </p>
            </div>

            {/* Sandbox / Live toggle */}
            <button
              onClick={() => setTestMode(!testMode)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.5rem",
                backgroundColor: "#f9fafb",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
            >
              {testMode ? (
                <ToggleRight style={{ width: "1.5rem", height: "1.5rem", color: "#fbbf24", flexShrink: 0 }} />
              ) : (
                <ToggleLeft style={{ width: "1.5rem", height: "1.5rem", color: "#9ca3af", flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a1a3e" }}>
                  {testMode ? "Sandbox Mode" : "Live Mode"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  {testMode
                    ? `Using ${baseUrl}`
                    : `Using ${baseUrl}`}
                </div>
              </div>
            </button>
          </section>

          {/* Documentation */}
          <section style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <FileJson style={{ width: "2rem", height: "2rem", color: "#fbbf24" }} />
              <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#1a1a3e" }}>Documentation</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { href: DOCS_URLS.API_REFERENCE, icon: "📚", title: "API Reference", desc: "Complete endpoint documentation" },
                { href: DOCS_URLS.GETTING_STARTED, icon: "🚀", title: "Getting Started", desc: "Setup guide and best practices" },
                { href: DOCS_URLS.AUTHENTICATION, icon: "🔒", title: "Authentication", desc: "API key security and bearer tokens" },
                { href: DOCS_URLS.RATE_LIMITS, icon: "⚡", title: "Rate Limits", desc: "Throttling and resilient client design" },
              ].map(({ href, icon, title, desc }) => (
                <a
                  key={href}
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.875rem",
                    border: "1px solid #e5e7eb",
                    borderRadius: "0.5rem",
                    backgroundColor: "#f9fafb",
                    color: "#1a1a3e",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ fontSize: "1.25rem" }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{title}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{desc}</div>
                  </div>
                </a>
              ))}
            </div>
          </section>

          {/* API Status */}
          <section style={card}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#1a1a3e", marginBottom: "1.5rem" }}>API Status</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {(
                [
                  { label: "Status", value: "● Operational", valueStyle: { backgroundColor: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0", padding: "0.2rem 0.6rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 600 } as React.CSSProperties },
                  { label: "Uptime", value: "99.99%", valueStyle: { color: "#fbbf24", fontWeight: 600 } as React.CSSProperties },
                  { label: "Response Time", value: "145ms avg", valueStyle: { color: "#fbbf24", fontWeight: 600 } as React.CSSProperties },
                  { label: "Rate Limit", value: "5 req/min", valueStyle: { color: "#fbbf24", fontWeight: 600 } as React.CSSProperties },
                ] as { label: string; value: string; valueStyle: React.CSSProperties }[]
              ).map(({ label, value, valueStyle }) => (
                <div key={label} style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.875rem", color: "#1a1a3e" }}>{label}</span>
                  <span style={valueStyle}>{value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Sample Requests & Responses ── */}
        <section style={{ ...card, marginTop: "3rem" }}>
          <h2 style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#1a1a3e", marginBottom: "1.5rem" }}>
            Sample Requests &amp; Responses
          </h2>

          {/* Endpoint selector */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {ENDPOINTS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveEndpoint(id)}
                style={{
                  padding: "0.5rem 1.125rem",
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  backgroundColor: activeEndpoint === id ? "#fbbf24" : "#f3f4f6",
                  color: "#1a1a3e",
                  border: "none",
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                }}
              >
                {id === "webhook" && <Shield size={13} style={{ display: "inline", marginRight: "0.3rem", verticalAlign: "middle" }} />}
                {label}
              </button>
            ))}
          </div>

          {/* Endpoint meta */}
          <div style={{ marginBottom: "1.25rem", padding: "0.75rem 1rem", backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "0.5rem", fontSize: "0.8125rem", color: "#6b7280", fontFamily: "monospace" }}>
            {activeEndpoint === "create"  && <><span style={{ color: "#16a34a", fontWeight: 700 }}>POST</span>{"  "}{baseUrl}/api/v1/payments</>}
            {activeEndpoint === "fetch"   && <><span style={{ color: "#2563eb", fontWeight: 700 }}>GET</span>{"   "}{baseUrl}/api/v1/payments/:id</>}
            {activeEndpoint === "list"    && <><span style={{ color: "#2563eb", fontWeight: 700 }}>GET</span>{"   "}{baseUrl}/api/v1/payments</>}
            {activeEndpoint === "webhook" && <><span style={{ color: "#7c3aed", fontWeight: 700 }}>POST</span>{"  "}https://yoursite.com/webhooks/fluxapay</>}
          </div>

          {/* Language tabs */}
          <div style={{ display: "flex", gap: "0", marginBottom: "1.25rem", borderBottom: "1px solid #e5e7eb" }}>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  padding: "0.5rem 1rem",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: `2px solid ${activeTab === id ? "#fbbf24" : "transparent"}`,
                  color: activeTab === id ? "#fbbf24" : "#9ca3af",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Request / Response side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#1a1a3e", marginBottom: "0.75rem" }}>
                {activeEndpoint === "webhook" ? "Verification Handler" : "Request"}
              </h3>
              <CodeBlock
                code={requestCode}
                id={`req-${activeEndpoint}-${activeTab}`}
                copied={copied}
                onCopy={copyToClipboard}
              />
            </div>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#1a1a3e", marginBottom: "0.75rem" }}>
                {activeEndpoint === "webhook" ? "Webhook Payload" : "Response"}
              </h3>
              <CodeBlock
                code={responseCode}
                id={`res-${activeEndpoint}`}
                copied={copied}
                onCopy={copyToClipboard}
              />
            </div>
          </div>
        </section>

        {/* ── Need Help ── */}
        <section style={{ ...card, marginTop: "3rem" }}>
          <h2 style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#1a1a3e", marginBottom: "1.5rem" }}>Need Help?</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.5rem" }}>
            {[
              { icon: "📖", title: "Full Documentation", desc: "Comprehensive API docs with detailed examples and use cases.", href: DOCS_URLS.FULL_DOCS, cta: "Read docs →" },
              { icon: "💬", title: "Community Support", desc: "Join our community forums and chat with other developers.", href: DOCS_URLS.COMMUNITY, cta: "Join community →" },
              { icon: "⚙️", title: "Status & Support", desc: "Check system status and get technical support from our team.", href: DOCS_URLS.STATUS, cta: "Get help →" },
            ].map(({ icon, title, desc, href, cta }) => (
              <div key={title} style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "1.5rem" }}>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{icon}</div>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#1a1a3e", marginBottom: "0.5rem" }}>{title}</h3>
                <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1rem", lineHeight: 1.5 }}>{desc}</p>
                <a href={href} style={{ color: "#fbbf24", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600 }}>{cta}</a>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
