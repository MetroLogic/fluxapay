"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { api } from "@/lib/api";
import { DOCS_URLS } from "@/lib/docs";

export default function DevelopersPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [activeTab, setActiveTab] = useState("rest");
  const [apiKey, setApiKey] = useState("Loading...");
  const [activeEndpoint, setActiveEndpoint] = useState<"create" | "status">("create");

  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const response = await api.merchant.getMe();
        setApiKey(response.merchant.api_key || "No API key generated");
      } catch (error) {
        console.error("Failed to fetch API key:", error);
        setApiKey("Failed to load API key");
      }
    };

    fetchApiKey();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // const styles = {
  //   container: `min-h-screen bg-slate-950 text-slate-50`,
  //   header: `bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-800 sticky top-0 z-50`,
  //   headerContent: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6`,
  //   headerTitle: `text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-300 mb-2`,
  //   headerSubtitle: `text-slate-400 text-lg`,

  //   mainContent: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12`,
  //   gridContainer: `grid grid-cols-1 lg:grid-cols-3 gap-8`,

  //   section: `rounded-lg border border-slate-800 bg-slate-900/50 p-6 backdrop-blur`,
  //   sectionTitle: `text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3`,
  //   sectionTitleIcon: `w-8 h-8 text-blue-400`,

  //   card: `bg-slate-800/50 rounded-lg border border-slate-700 p-4 mb-4 hover:border-slate-600 transition`,
  //   cardTitle: `text-lg font-semibold text-slate-100 mb-2`,
  //   cardDesc: `text-slate-400 text-sm mb-4`,

  //   button: `inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition`,
  //   buttonPrimary: `bg-blue-600 text-white hover:bg-blue-700 active:scale-95`,
  //   buttonSecondary: `bg-slate-700 text-slate-100 hover:bg-slate-600 active:scale-95`,
  //   buttonIcon: `w-4 h-4`,

  //   toggleButton: `flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 cursor-pointer hover:border-slate-600 transition`,

  //   badge: `inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/30`,

  //   input: `w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition font-mono text-sm`,

  //   codeBlock: `bg-slate-950 rounded-lg border border-slate-800 p-4 overflow-x-auto`,
  //   codeText: `text-slate-300 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words`,

  //   tabContainer: `flex gap-2 mb-6 border-b border-slate-800 overflow-x-auto`,
  //   tabButton: `px-4 py-2 font-medium text-sm border-b-2 transition whitespace-nowrap`,
  //   tabButtonActive: `border-blue-500 text-blue-400`,
  //   tabButtonInactive: `border-transparent text-slate-400 hover:text-slate-300`,

  //   docLink: `inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 transition border border-slate-700`,
  //   docLinkText: `text-sm font-medium`,
  // };

  const baseUrl = testMode
    ? "https://sandbox-api.fluxapay.com"
    : "https://api.fluxapay.com";

  const getCreatePaymentLines = (lang: "curl" | "js" | "python") => {
    const body = {
      amount: 100,
      currency: "USDC",
      customer_email: "customer@example.com",
      order_id: "order_123",
      success_url: "https://merchant.com/success",
      cancel_url: "https://merchant.com/cancel",
      metadata: { cart_id: "987" }
    };

    if (lang === "curl") {
      return `curl -X POST ${baseUrl}/v1/payments \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
    }

    if (lang === "js") {
      return `import fetch from 'node-fetch';

const response = await fetch('${baseUrl}/v1/payments', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${JSON.stringify(body, null, 2)})
});

const data = await response.json();
console.log(data);`;
    }

    return `import requests
import json

url = "${baseUrl}/v1/payments"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
}
payload = ${JSON.stringify(body, null, 4)}

response = requests.post(url, headers=headers, data=json.dumps(payload))
print(response.json())`;
  };

  const getStatusPaymentLines = (lang: "curl" | "js" | "python") => {
    const paymentId = "pay_123abc456";
    const url = `${baseUrl}/v1/payments/${paymentId}`;

    if (lang === "curl") {
      return `curl -X GET ${url} \\
  -H "Authorization: Bearer ${apiKey}"`;
    }

    if (lang === "js") {
      return `import fetch from 'node-fetch';

const response = await fetch('${url}', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ${apiKey}'
  }
});

const data = await response.json();
console.log(data);`;
    }

    return `import requests

url = "${url}"
headers = {
    "Authorization": "Bearer ${apiKey}"
}

response = requests.get(url, headers=headers)
print(response.json())`;
  };

  const getActiveRequest = () => {
    const lang = activeTab === "rest" ? "curl" : (activeTab as "js" | "python");
    return activeEndpoint === "create" ? getCreatePaymentLines(lang) : getStatusPaymentLines(lang);
  };

  const getActiveResponse = () => {
    if (activeEndpoint === "create") {
      return `{
  "id": "pay_123abc456",
  "amount": 100,
  "currency": "USDC",
  "status": "pending",
  "checkout_url": "https://pay.fluxapay.com/pay_123abc456",
  "customer_email": "customer@example.com",
  "order_id": "order_123",
  "metadata": {
    "cart_id": "987"
  },
  "created_at": "${new Date().toISOString()}"
}`;
    }
    return `{
  "id": "pay_123abc456",
  "amount": 100,
  "currency": "USDC",
  "status": "paid",
  "customer_email": "customer@example.com",
  "order_id": "order_123",
  "transaction_hash": "tx_abc123...",
  "confirmed_at": "${new Date().toISOString()}"
}`;
  };

  const restRequest = getActiveRequest();
  const restResponse = getActiveResponse();
  const jsRequest = getActiveRequest();
  const pythonRequest = getActiveRequest();

  return (
    <div
      style={{ backgroundColor: "#ffffff", color: "#1a1a3e" }}
      className="min-h-screen"
    >
      {/* Header */}
      <header
        style={{
          backgroundImage: "linear-gradient(to right, #ffffff, #f9fafb)",
          borderBottomColor: "#e5e7eb",
          borderBottomWidth: "1px",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: "80rem",
            margin: "0 auto",
            padding: "1.5rem 1rem",
          }}
          className="sm:px-6 lg:px-8"
        >
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
            Integrate with our API in minutes. Get started with comprehensive
            documentation and examples.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{ maxWidth: "80rem", margin: "0 auto", padding: "3rem 1rem" }}
        className="sm:px-6 lg:px-8"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "2rem",
          }}
        >
          {/* API Key Management */}
          <section
            style={{
              borderColor: "#3d3d6b",
              borderWidth: "1px",
              borderRadius: "0.5rem",
              backgroundColor: "#ffffff",
              padding: "1.5rem",
              backdropFilter: "blur(10px)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              <Code
                style={{ width: "2rem", height: "2rem", color: "#fbbf24" }}
              />
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  color: "#1a1a3e",
                }}
              >
                API Key
              </h2>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  color: "#1a1a3e",
                  fontWeight: "500",
                  fontSize: "0.875rem",
                }}
              >
                Your Live API Key
              </label>
              <div
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  readOnly
                  style={{
                    flex: 1,
                    backgroundColor: "#f3f4f6",
                    borderColor: "#d1d5db",
                    borderWidth: "1px",
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
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "#e5e7eb",
                    borderColor: "#d1d5db",
                    borderWidth: "1px",
                    borderRadius: "0.5rem",
                    color: "#1a1a3e",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = "#d1d5db";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = "#e5e7eb";
                  }}
                >
                  {showApiKey ? (
                    <EyeOff style={{ width: "1rem", height: "1rem" }} />
                  ) : (
                    <Eye style={{ width: "1rem", height: "1rem" }} />
                  )}
                </button>
                <button
                  onClick={() => copyToClipboard(apiKey, "apikey")}
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "#fbbf24",
                    borderColor: "#fbbf24",
                    borderWidth: "1px",
                    borderRadius: "0.5rem",
                    color: "#1a1a3e",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    fontWeight: "600",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = "#f59e0b";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = "#fbbf24";
                  }}
                >
                  {copied === "apikey" ? (
                    <Check style={{ width: "1rem", height: "1rem" }} />
                  ) : (
                    <Copy style={{ width: "1rem", height: "1rem" }} />
                  )}
                </button>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#fef3c7",
                borderColor: "#fcd34d",
                borderWidth: "1px",
                borderRadius: "0.5rem",
                padding: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "#92400e",
                  lineHeight: "1.5",
                }}
              >
                ⚠️ Keep your API key secret. Never share it publicly or commit
                it to version control.
              </p>
            </div>

            {/* Test Mode Toggle */}
            <div
              onClick={() => setTestMode(!testMode)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "0.75rem",
                borderColor: "#d1d5db",
                borderWidth: "1px",
                borderRadius: "0.5rem",
                backgroundColor: "#f9fafb",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.borderColor = "#9ca3af";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.borderColor = "#d1d5db";
              }}
            >
              <div>
                {testMode ? (
                  <ToggleRight
                    style={{
                      width: "1.5rem",
                      height: "1.5rem",
                      color: "#fbbf24",
                    }}
                  />
                ) : (
                  <ToggleLeft
                    style={{
                      width: "1.5rem",
                      height: "1.5rem",
                      color: "#9ca3af",
                    }}
                  />
                )}
              </div>
              <div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    color: "#1a1a3e",
                  }}
                >
                  Test Mode
                </div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  {testMode
                    ? "Enabled - Requests are sandboxed"
                    : "Disabled - Using live endpoint"}
                </div>
              </div>
            </div>
          </section>

          {/* Documentation */}
          <section
            style={{
              borderColor: "#3d3d6b",
              borderWidth: "1px",
              borderRadius: "0.5rem",
              backgroundColor: "#ffffff",
              padding: "1.5rem",
              backdropFilter: "blur(10px)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              <FileJson
                style={{ width: "2rem", height: "2rem", color: "#fbbf24" }}
              />
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  color: "#1a1a3e",
                }}
              >
                Documentation
              </h2>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <a
                href={DOCS_URLS.API_REFERENCE}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "1rem",
                  borderColor: "#e5e7eb",
                  borderWidth: "1px",
                  borderRadius: "0.5rem",
                  backgroundColor: "#f9fafb",
                  color: "#1a1a3e",
                  textDecoration: "none",
                  transition: "all 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f3f4f6";
                  (e.target as HTMLElement).style.borderColor = "#d1d5db";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f9fafb";
                  (e.target as HTMLElement).style.borderColor = "#e5e7eb";
                }}
              >
                <span style={{ fontSize: "1.25rem" }}>📚</span>
                <div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      color: "#1a1a3e",
                    }}
                  >
                    API Reference
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    Complete endpoint documentation
                  </div>
                </div>
              </a>

              <a
                href={DOCS_URLS.GETTING_STARTED}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "1rem",
                  borderColor: "#e5e7eb",
                  borderWidth: "1px",
                  borderRadius: "0.5rem",
                  backgroundColor: "#f9fafb",
                  color: "#1a1a3e",
                  textDecoration: "none",
                  transition: "all 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f3f4f6";
                  (e.target as HTMLElement).style.borderColor = "#d1d5db";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f9fafb";
                  (e.target as HTMLElement).style.borderColor = "#e5e7eb";
                }}
              >
                <span style={{ fontSize: "1.25rem" }}>🚀</span>
                <div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      color: "#1a1a3e",
                    }}
                  >
                    Getting Started
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    Setup guide and best practices
                  </div>
                </div>
              </a>

              <a
                href={DOCS_URLS.AUTHENTICATION}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "1rem",
                  borderColor: "#e5e7eb",
                  borderWidth: "1px",
                  borderRadius: "0.5rem",
                  backgroundColor: "#f9fafb",
                  color: "#1a1a3e",
                  textDecoration: "none",
                  transition: "all 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f3f4f6";
                  (e.target as HTMLElement).style.borderColor = "#d1d5db";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f9fafb";
                  (e.target as HTMLElement).style.borderColor = "#e5e7eb";
                }}
              >
                <span style={{ fontSize: "1.25rem" }}>🔒</span>
                <div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      color: "#1a1a3e",
                    }}
                  >
                    Authentication
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    Learn about API key security
                  </div>
                </div>
              </a>

              <a
                href={DOCS_URLS.RATE_LIMITS}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "1rem",
                  borderColor: "#e5e7eb",
                  borderWidth: "1px",
                  borderRadius: "0.5rem",
                  backgroundColor: "#f9fafb",
                  color: "#1a1a3e",
                  textDecoration: "none",
                  transition: "all 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f3f4f6";
                  (e.target as HTMLElement).style.borderColor = "#d1d5db";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f9fafb";
                  (e.target as HTMLElement).style.borderColor = "#e5e7eb";
                }}
              >
                <span style={{ fontSize: "1.25rem" }}>⚡</span>
                <div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      color: "#1a1a3e",
                    }}
                  >
                    Rate Limits
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    Understand API rate limiting
                  </div>
                </div>
              </a>
            </div>
          </section>

          {/* Quick Stats */}
          <section
            style={{
              borderColor: "#3d3d6b",
              borderWidth: "1px",
              borderRadius: "0.5rem",
              backgroundColor: "#ffffff",
              padding: "1.5rem",
              backdropFilter: "blur(10px)",
            }}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                color: "#1a1a3e",
                marginBottom: "1.5rem",
              }}
            >
              API Status
            </h2>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div
                style={{
                  backgroundColor: "#f9fafb",
                  borderColor: "#e5e7eb",
                  borderWidth: "1px",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "#1a1a3e" }}>
                    Status
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                      fontWeight: "600",
                      backgroundColor: "#d1fae5",
                      color: "#065f46",
                      borderColor: "#a7f3d0",
                      borderWidth: "1px",
                    }}
                  >
                    ● Operational
                  </span>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  All systems operational
                </p>
              </div>

              <div
                style={{
                  backgroundColor: "#f9fafb",
                  borderColor: "#e5e7eb",
                  borderWidth: "1px",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "#1a1a3e" }}>
                    Uptime
                  </span>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      color: "#fbbf24",
                    }}
                  >
                    99.99%
                  </span>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  Last 30 days
                </p>
              </div>

              <div
                style={{
                  backgroundColor: "#f9fafb",
                  borderColor: "#e5e7eb",
                  borderWidth: "1px",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "#1a1a3e" }}>
                    Response Time
                  </span>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      color: "#fbbf24",
                    }}
                  >
                    145ms
                  </span>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  Average latency
                </p>
              </div>

              <div
                style={{
                  backgroundColor: "#f9fafb",
                  borderColor: "#e5e7eb",
                  borderWidth: "1px",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "#1a1a3e" }}>
                    Rate Limit
                  </span>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      color: "#fbbf24",
                    }}
                  >
                    10,000/min
                  </span>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  Per API key
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Sample Requests & Responses */}
        <section
          style={{
            marginTop: "3rem",
            borderColor: "#3d3d6b",
            borderWidth: "1px",
            borderRadius: "0.5rem",
            backgroundColor: "#ffffff",
            padding: "1.5rem",
            backdropFilter: "blur(10px)",
          }}
        >
          <h2
            style={{
              fontSize: "1.875rem",
              fontWeight: "bold",
              color: "#1a1a3e",
              marginBottom: "1.5rem",
            }}
          >
            Sample Requests & Responses
          </h2>

          <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
            <button
              onClick={() => setActiveEndpoint("create")}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                fontWeight: "600",
                fontSize: "0.875rem",
                backgroundColor: activeEndpoint === "create" ? "#fbbf24" : "#f3f4f6",
                color: "#1a1a3e",
                border: "none",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Create Payment
            </button>
            <button
              onClick={() => setActiveEndpoint("status")}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                fontWeight: "600",
                fontSize: "0.875rem",
                backgroundColor: activeEndpoint === "status" ? "#fbbf24" : "#f3f4f6",
                color: "#1a1a3e",
                border: "none",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Get Payment Status
            </button>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "1.5rem",
              borderBottomColor: "#e5e7eb",
              borderBottomWidth: "1px",
              overflowX: "auto",
            }}
          >
            {[
              { id: "rest", label: "cURL", Icon: Terminal },
              { id: "js", label: "JavaScript", Icon: Braces },
              { id: "python", label: "Python", Icon: Code },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "0.5rem 1rem",
                  fontWeight: "500",
                  fontSize: "0.875rem",
                  borderBottomWidth: "2px",
                  borderBottomColor:
                    activeTab === tab.id ? "#fbbf24" : "transparent",
                  color: activeTab === tab.id ? "#fbbf24" : "#9ca3af",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    (e.target as HTMLElement).style.color = "#6b7280";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    (e.target as HTMLElement).style.color = "#9ca3af";
                  }
                }}
              >
                <tab.Icon
                  style={{ marginRight: "0.25rem", display: "inline" }}
                  size={16}
                />
                {tab.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "2rem",
            }}
          >
            {/* Request */}
            <div>
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  color: "#1a1a3e",
                  marginBottom: "1rem",
                }}
              >
                Request
              </h3>
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
                    fontSize: "0.875rem",
                    lineHeight: "1.5",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                  }}
                >
                  {activeTab === "rest" && restRequest}
                  {activeTab === "js" && jsRequest}
                  {activeTab === "python" && pythonRequest}
                </pre>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    activeTab === "rest"
                      ? restRequest
                      : activeTab === "js"
                        ? jsRequest
                        : pythonRequest,
                    `request-${activeTab}`,
                  )
                }
                style={{
                  marginTop: "0.75rem",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fbbf24",
                  color: "#1a1a3e",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f59e0b";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#fbbf24";
                }}
              >
                {copied === `request-${activeTab}` ? (
                  <>
                    <Check style={{ width: "1rem", height: "1rem" }} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy style={{ width: "1rem", height: "1rem" }} />
                    Copy
                  </>
                )}
              </button>
            </div>

            {/* Response */}
            <div>
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  color: "#1a1a3e",
                  marginBottom: "1rem",
                }}
              >
                Response
              </h3>
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
                    fontSize: "0.875rem",
                    lineHeight: "1.5",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                  }}
                >
                  {restResponse}
                </pre>
              </div>
              <button
                onClick={() => copyToClipboard(restResponse, "response")}
                style={{
                  marginTop: "0.75rem",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fbbf24",
                  color: "#1a1a3e",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#f59e0b";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#fbbf24";
                }}
              >
                {copied === "response" ? (
                  <>
                    <Check style={{ width: "1rem", height: "1rem" }} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy style={{ width: "1rem", height: "1rem" }} />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Additional Resources */}
        <section
          style={{
            marginTop: "3rem",
            borderColor: "#3d3d6b",
            borderWidth: "1px",
            borderRadius: "0.5rem",
            backgroundColor: "#ffffff",
            padding: "1.5rem",
            backdropFilter: "blur(10px)",
          }}
        >
          <h2
            style={{
              fontSize: "1.875rem",
              fontWeight: "bold",
              color: "#1a1a3e",
              marginBottom: "1.5rem",
            }}
          >
            Need Help?
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "1.5rem",
            }}
          >
            <div
              style={{
                backgroundColor: "#f9fafb",
                borderColor: "#e5e7eb",
                borderWidth: "1px",
                borderRadius: "0.5rem",
                padding: "1.5rem",
              }}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                📖
              </div>
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  color: "#1a1a3e",
                  marginBottom: "0.5rem",
                }}
              >
                Full Documentation
              </h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "#6b7280",
                  marginBottom: "1rem",
                  lineHeight: "1.5",
                }}
              >
                Explore comprehensive API documentation with detailed examples
                and use cases.
              </p>
              <a
                href={DOCS_URLS.FULL_DOCS}
                style={{
                  color: "#fbbf24",
                  textDecoration: "none",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                }}
              >
                Read docs →
              </a>
            </div>

            <div
              style={{
                backgroundColor: "#f9fafb",
                borderColor: "#e5e7eb",
                borderWidth: "1px",
                borderRadius: "0.5rem",
                padding: "1.5rem",
              }}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                💬
              </div>
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  color: "#1a1a3e",
                  marginBottom: "0.5rem",
                }}
              >
                Community Support
              </h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "#6b7280",
                  marginBottom: "1rem",
                  lineHeight: "1.5",
                }}
              >
                Join our community forums and chat with other developers.
              </p>
              <a
                href={DOCS_URLS.COMMUNITY}
                style={{
                  color: "#fbbf24",
                  textDecoration: "none",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                }}
              >
                Join community →
              </a>
            </div>

            <div
              style={{
                backgroundColor: "#f9fafb",
                borderColor: "#e5e7eb",
                borderWidth: "1px",
                borderRadius: "0.5rem",
                padding: "1.5rem",
              }}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                ⚙️
              </div>
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  color: "#1a1a3e",
                  marginBottom: "0.5rem",
                }}
              >
                Status & Support
              </h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "#6b7280",
                  marginBottom: "1rem",
                  lineHeight: "1.5",
                }}
              >
                Check system status and get technical support from our team.
              </p>
              <a
                href={DOCS_URLS.STATUS}
                style={{
                  color: "#fbbf24",
                  textDecoration: "none",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                }}
              >
                Get help →
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
