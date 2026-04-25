import { Metadata } from "next";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { EndpointCard } from "@/components/docs/EndpointCard";
import { EditOnGitHub } from "@/components/docs/EditOnGitHub";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "API Reference - FluxaPay REST API Documentation",
    description: "Complete FluxaPay REST API reference with endpoints, request/response examples, and error codes. Code examples in TypeScript and Python.",
    slug: "/docs/api-reference",
    keywords: ["API", "REST API", "endpoints", "reference", "documentation", "integration", "payments", "settlements"],
    locale,
  });
}

const endpoints = {
  payments: [
    {
      method: "POST" as const,
      path: "/api/v1/payments",
      title: "Create Payment",
      description: "Create a new payment intent. Returns a checkout URL where the customer can complete the payment.",
      params: [
        { name: "amount", type: "number", required: true, description: "Payment amount in the specified currency" },
        { name: "currency", type: "string", required: true, description: "Currency code (USDC, XLM)" },
        { name: "customer_email", type: "string", required: true, description: "Customer email address" },
        { name: "success_url", type: "string", required: false, description: "URL to redirect after successful payment" },
        { name: "cancel_url", type: "string", required: false, description: "URL to redirect if payment is cancelled" },
        { name: "metadata", type: "object", required: false, description: "Custom metadata to attach to the payment" },
      ],
      responses: [
        { status: 201, description: "Payment created successfully" },
        { status: 400, description: "Invalid request parameters" },
        { status: 401, description: "Authentication required" },
        { status: 429, description: "Rate limit exceeded" },
      ],
      tsExample: `const response = await fetch('https://api.fluxapay.com/api/v1/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    amount: 100.00,
    currency: 'USDC',
    customer_email: 'customer@example.com',
    success_url: 'https://yoursite.com/success',
    cancel_url: 'https://yoursite.com/cancel',
    metadata: { order_id: 'ord_12345' }
  })
});

const payment = await response.json();
console.log(payment);`,
      pythonExample: `import requests

response = requests.post(
    'https://api.fluxapay.com/api/v1/payments',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
    },
    json={
        'amount': 100.00,
        'currency': 'USDC',
        'customer_email': 'customer@example.com',
        'success_url': 'https://yoursite.com/success',
        'cancel_url': 'https://yoursite.com/cancel',
        'metadata': {'order_id': 'ord_12345'}
    }
)

payment = response.json()
print(payment)`,
    },
    {
      method: "GET" as const,
      path: "/api/v1/payments",
      title: "List Payments",
      description: "Retrieve a paginated list of payments for the authenticated merchant.",
      params: [
        { name: "page", type: "integer", required: false, description: "Page number (default: 1)" },
        { name: "limit", type: "integer", required: false, description: "Items per page (default: 10, max: 100)" },
        { name: "status", type: "string", required: false, description: "Filter by status (pending, confirmed, failed, expired)" },
        { name: "currency", type: "string", required: false, description: "Filter by currency" },
        { name: "date_from", type: "string", required: false, description: "Filter from date (ISO 8601)" },
        { name: "date_to", type: "string", required: false, description: "Filter to date (ISO 8601)" },
      ],
      responses: [
        { status: 200, description: "List of payments returned successfully" },
        { status: 401, description: "Authentication required" },
      ],
      tsExample: `const response = await fetch(
  'https://api.fluxapay.com/api/v1/payments?status=confirmed&limit=20',
  {
    headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
  }
);

const { data, meta } = await response.json();
console.log(\`Found \${meta.total} payments\`);`,
      pythonExample: `import requests

response = requests.get(
    'https://api.fluxapay.com/api/v1/payments',
    params={'status': 'confirmed', 'limit': 20},
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)

data = response.json()
print(f"Found {data['meta']['total']} payments")`,
    },
    {
      method: "GET" as const,
      path: "/api/v1/payments/:id",
      title: "Get Payment",
      description: "Retrieve details of a specific payment by ID.",
      params: [
        { name: "id", type: "string", required: true, description: "Payment ID (path parameter)" },
      ],
      responses: [
        { status: 200, description: "Payment details returned" },
        { status: 404, description: "Payment not found" },
      ],
      tsExample: `const response = await fetch(
  'https://api.fluxapay.com/api/v1/payments/pay_abc123',
  { headers: { 'Authorization': 'Bearer YOUR_API_KEY' } }
);

const payment = await response.json();
console.log(payment);`,
      pythonExample: `import requests

response = requests.get(
    'https://api.fluxapay.com/api/v1/payments/pay_abc123',
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)

payment = response.json()
print(payment)`,
    },
  ],
  invoices: [
    {
      method: "POST" as const,
      path: "/api/v1/invoices",
      title: "Create Invoice",
      description: "Create a new invoice with an embedded payment link.",
      params: [
        { name: "customer_name", type: "string", required: true, description: "Customer name" },
        { name: "customer_email", type: "string", required: true, description: "Customer email address" },
        { name: "line_items", type: "array", required: true, description: "Array of line items with description, quantity, unit_price" },
        { name: "currency", type: "string", required: true, description: "Invoice currency (USD, EUR, GBP, NGN, KES, GHS)" },
        { name: "due_date", type: "string", required: false, description: "Due date (ISO 8601)" },
        { name: "notes", type: "string", required: false, description: "Additional notes for the invoice" },
      ],
      responses: [
        { status: 201, description: "Invoice created successfully" },
        { status: 400, description: "Invalid request parameters" },
        { status: 401, description: "Authentication required" },
      ],
      tsExample: `const response = await fetch('https://api.fluxapay.com/api/v1/invoices', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    customer_name: 'Jane Doe',
    customer_email: 'jane@example.com',
    line_items: [
      { description: 'Consulting Services', quantity: 10, unit_price: 150 }
    ],
    currency: 'USD',
    due_date: '2026-03-15T00:00:00Z',
    notes: 'Payment due within 30 days'
  })
});

const invoice = await response.json();
console.log('Invoice URL:', invoice.payment_link);`,
      pythonExample: `import requests

response = requests.post(
    'https://api.fluxapay.com/api/v1/invoices',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
    },
    json={
        'customer_name': 'Jane Doe',
        'customer_email': 'jane@example.com',
        'line_items': [
            {'description': 'Consulting Services', 'quantity': 10, 'unit_price': 150}
        ],
        'currency': 'USD',
        'due_date': '2026-03-15T00:00:00Z',
        'notes': 'Payment due within 30 days'
    }
)

invoice = response.json()
print('Invoice URL:', invoice['payment_link'])`,
    },
    {
      method: "GET" as const,
      path: "/api/v1/invoices",
      title: "List Invoices",
      description: "Retrieve a paginated list of invoices.",
      params: [
        { name: "page", type: "integer", required: false, description: "Page number" },
        { name: "limit", type: "integer", required: false, description: "Items per page" },
        { name: "status", type: "string", required: false, description: "Filter by status (unpaid, pending, paid, overdue)" },
      ],
      responses: [
        { status: 200, description: "List of invoices returned" },
        { status: 401, description: "Authentication required" },
      ],
      tsExample: `const response = await fetch(
  'https://api.fluxapay.com/api/v1/invoices?status=unpaid',
  { headers: { 'Authorization': 'Bearer YOUR_API_KEY' } }
);

const { invoices } = await response.json();`,
      pythonExample: `import requests

response = requests.get(
    'https://api.fluxapay.com/api/v1/invoices',
    params={'status': 'unpaid'},
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)

invoices = response.json()`,
    },
  ],
  settlements: [
    {
      method: "GET" as const,
      path: "/api/v1/settlements",
      title: "List Settlements",
      description: "Retrieve a list of fiat settlements for the authenticated merchant.",
      params: [
        { name: "page", type: "integer", required: false, description: "Page number" },
        { name: "limit", type: "integer", required: false, description: "Items per page" },
        { name: "status", type: "string", required: false, description: "Filter by status (pending, completed, failed)" },
        { name: "currency", type: "string", required: false, description: "Filter by settlement currency" },
        { name: "date_from", type: "string", required: false, description: "Filter from date" },
        { name: "date_to", type: "string", required: false, description: "Filter to date" },
      ],
      responses: [
        { status: 200, description: "List of settlements returned" },
        { status: 401, description: "Authentication required" },
      ],
      tsExample: `const response = await fetch(
  'https://api.fluxapay.com/api/v1/settlements?status=completed',
  { headers: { 'Authorization': 'Bearer YOUR_API_KEY' } }
);

const { settlements, pagination } = await response.json();`,
      pythonExample: `import requests

response = requests.get(
    'https://api.fluxapay.com/api/v1/settlements',
    params={'status': 'completed'},
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)

data = response.json()`,
    },
    {
      method: "GET" as const,
      path: "/api/v1/settlements/summary",
      title: "Settlement Summary",
      description: "Get a summary of settlement statistics including totals and next scheduled settlement.",
      params: [],
      responses: [
        { status: 200, description: "Settlement summary returned" },
        { status: 401, description: "Authentication required" },
      ],
      tsExample: `const response = await fetch(
  'https://api.fluxapay.com/api/v1/settlements/summary',
  { headers: { 'Authorization': 'Bearer YOUR_API_KEY' } }
);

const summary = await response.json();
console.log('Total settled:', summary.total_settled_this_month);`,
      pythonExample: `import requests

response = requests.get(
    'https://api.fluxapay.com/api/v1/settlements/summary',
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)

summary = response.json()
print('Total settled:', summary['total_settled_this_month'])`,
    },
    {
      method: "GET" as const,
      path: "/api/v1/settlements/:id",
      title: "Get Settlement Details",
      description: "Retrieve detailed information about a specific settlement including all included payments.",
      params: [
        { name: "id", type: "string", required: true, description: "Settlement ID" },
      ],
      responses: [
        { status: 200, description: "Settlement details returned" },
        { status: 404, description: "Settlement not found" },
      ],
      tsExample: `const response = await fetch(
  'https://api.fluxapay.com/api/v1/settlements/set_xyz789',
  { headers: { 'Authorization': 'Bearer YOUR_API_KEY' } }
);

const settlement = await response.json();`,
      pythonExample: `import requests

response = requests.get(
    'https://api.fluxapay.com/api/v1/settlements/set_xyz789',
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)

settlement = response.json()`,
    },
  ],
  webhooks: [
    {
      method: "GET" as const,
      path: "/api/v1/webhooks/logs",
      title: "List Webhook Logs",
      description: "Retrieve delivery logs for webhook events sent to your endpoint.",
      params: [
        { name: "event_type", type: "string", required: false, description: "Filter by event type" },
        { name: "status", type: "string", required: false, description: "Filter by delivery status (success, failed)" },
        { name: "page", type: "integer", required: false, description: "Page number" },
        { name: "limit", type: "integer", required: false, description: "Items per page" },
      ],
      responses: [
        { status: 200, description: "Webhook logs returned" },
        { status: 401, description: "Authentication required" },
      ],
      tsExample: `const response = await fetch(
  'https://api.fluxapay.com/api/v1/webhooks/logs?status=failed',
  { headers: { 'Authorization': 'Bearer YOUR_API_KEY' } }
);

const logs = await response.json();`,
      pythonExample: `import requests

response = requests.get(
    'https://api.fluxapay.com/api/v1/webhooks/logs',
    params={'status': 'failed'},
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)

logs = response.json()`,
    },
    {
      method: "POST" as const,
      path: "/api/v1/webhooks/logs/:id/retry",
      title: "Retry Webhook",
      description: "Manually retry a failed webhook delivery.",
      params: [
        { name: "id", type: "string", required: true, description: "Webhook log ID" },
      ],
      responses: [
        { status: 200, description: "Webhook retry initiated" },
        { status: 404, description: "Webhook log not found" },
      ],
      tsExample: `const response = await fetch(
  'https://api.fluxapay.com/api/v1/webhooks/logs/whl_abc123/retry',
  { 
    method: 'POST',
    headers: { 'Authorization': 'Bearer YOUR_API_KEY' } 
  }
);`,
      pythonExample: `import requests

response = requests.post(
    'https://api.fluxapay.com/api/v1/webhooks/logs/whl_abc123/retry',
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)`,
    },
  ],
  refunds: [
    {
      method: "POST" as const,
      path: "/api/v1/refunds",
      title: "Initiate Refund",
      description: "Initiate a refund for a completed payment.",
      params: [
        { name: "paymentId", type: "string", required: true, description: "ID of the payment to refund" },
        { name: "amount", type: "number", required: true, description: "Refund amount (can be partial)" },
        { name: "currency", type: "string", required: true, description: "Currency (USDC, XLM)" },
        { name: "customerAddress", type: "string", required: true, description: "Customer wallet address for refund" },
        { name: "reason", type: "string", required: false, description: "Refund reason" },
      ],
      responses: [
        { status: 201, description: "Refund initiated successfully" },
        { status: 400, description: "Invalid request or payment not refundable" },
        { status: 401, description: "Authentication required" },
      ],
      tsExample: `const response = await fetch('https://api.fluxapay.com/api/v1/refunds', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    paymentId: 'pay_abc123',
    amount: 50.00,
    currency: 'USDC',
    customerAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    reason: 'customer_request'
  })
});

const refund = await response.json();`,
      pythonExample: `import requests

response = requests.post(
    'https://api.fluxapay.com/api/v1/refunds',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
    },
    json={
        'paymentId': 'pay_abc123',
        'amount': 50.00,
        'currency': 'USDC',
        'customerAddress': 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        'reason': 'customer_request'
    }
)

refund = response.json()`,
    },
    {
      method: "GET" as const,
      path: "/api/v1/refunds",
      title: "List Refunds",
      description: "Retrieve a list of refunds.",
      params: [
        { name: "paymentId", type: "string", required: false, description: "Filter by payment ID" },
        { name: "status", type: "string", required: false, description: "Filter by status" },
        { name: "page", type: "integer", required: false, description: "Page number" },
        { name: "limit", type: "integer", required: false, description: "Items per page" },
      ],
      responses: [
        { status: 200, description: "List of refunds returned" },
        { status: 401, description: "Authentication required" },
      ],
      tsExample: `const response = await fetch(
  'https://api.fluxapay.com/api/v1/refunds?status=completed',
  { headers: { 'Authorization': 'Bearer YOUR_API_KEY' } }
);

const refunds = await response.json();`,
      pythonExample: `import requests

response = requests.get(
    'https://api.fluxapay.com/api/v1/refunds',
    params={'status': 'completed'},
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)

refunds = response.json()`,
    },
  ],
};

export default function LocalizedApiReferencePage() {
  return (
    <DocsLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-2">
            API Reference
          </p>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            REST API Documentation
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl">
            Complete reference for the FluxaPay REST API. All endpoints require authentication
            via Bearer token unless otherwise noted.
          </p>
        </div>

        {/* Base URL */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
          <p className="text-sm font-medium text-slate-500 mb-1">Base URL</p>
          <code className="text-lg font-mono text-slate-900">https://api.fluxapay.com</code>
          <p className="text-sm text-slate-500 mt-2">
            Sandbox: <code className="font-mono">https://sandbox-api.fluxapay.com</code>
          </p>
        </div>

        {/* Payments */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4" id="payments">
            Payments
          </h2>
          <p className="text-slate-600 mb-4">
            Create and manage payment intents. Payments represent the core transaction flow in FluxaPay.
          </p>
          {endpoints.payments.map((endpoint) => (
            <EndpointCard key={endpoint.path} {...endpoint} />
          ))}
        </section>

        {/* Invoices */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4" id="invoices">
            Invoices
          </h2>
          <p className="text-slate-600 mb-4">
            Create and manage invoices with embedded payment links. Invoices can be shared with customers
            for easy payment.
          </p>
          {endpoints.invoices.map((endpoint) => (
            <EndpointCard key={endpoint.path} {...endpoint} />
          ))}
        </section>

        {/* Settlements */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4" id="settlements">
            Settlements
          </h2>
          <p className="text-slate-600 mb-4">
            View fiat settlement history and details. Settlements represent the conversion of crypto
            payments to your local currency.
          </p>
          {endpoints.settlements.map((endpoint) => (
            <EndpointCard key={endpoint.path} {...endpoint} />
          ))}
        </section>

        {/* Webhooks */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4" id="webhooks">
            Webhooks
          </h2>
          <p className="text-slate-600 mb-4">
            Manage webhook delivery logs and retry failed deliveries. Configure your webhook endpoint
            in the dashboard settings.
          </p>
          {endpoints.webhooks.map((endpoint) => (
            <EndpointCard key={endpoint.path} {...endpoint} />
          ))}
        </section>

        {/* Refunds */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4" id="refunds">
            Refunds
          </h2>
          <p className="text-slate-600 mb-4">
            Initiate and track refunds for completed payments. Refunds are processed on the Stellar network.
          </p>
          {endpoints.refunds.map((endpoint) => (
            <EndpointCard key={endpoint.path} {...endpoint} />
          ))}
        </section>

        {/* Error Codes */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Error Codes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-slate-500">Code</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-3 px-4 font-mono text-red-600">400</td>
                  <td className="py-3 px-4 text-slate-600">Bad Request - Invalid parameters or malformed request</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-red-600">401</td>
                  <td className="py-3 px-4 text-slate-600">Unauthorized - Missing or invalid API key</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-red-600">403</td>
                  <td className="py-3 px-4 text-slate-600">Forbidden - Insufficient permissions</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-red-600">404</td>
                  <td className="py-3 px-4 text-slate-600">Not Found - Resource does not exist</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-red-600">429</td>
                  <td className="py-3 px-4 text-slate-600">Too Many Requests - Rate limit exceeded</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-red-600">500</td>
                  <td className="py-3 px-4 text-slate-600">Internal Server Error - Something went wrong on our end</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Edit on GitHub */}
        <div className="pt-4 border-t border-slate-200">
          <EditOnGitHub filePath="fluxapay_frontend/src/app/[locale]/docs/api-reference/page.tsx" />
        </div>
      </div>
    </DocsLayout>
  );
}
