import { Metadata } from "next";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { EditOnGitHub } from "@/components/docs/EditOnGitHub";
import { generatePageMetadata } from "@/lib/seo";
import { Shield, Lock, AlertCircle, CheckCircle } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Authentication - FluxaPay API Documentation",
    description: "Learn about FluxaPay API authentication methods, API keys, security best practices, and how to securely manage credentials.",
    slug: "/docs/authentication",
    keywords: ["authentication", "API keys", "security", "authorization", "bearer token", "credentials"],
    locale,
  });
}

const bearerTokenExample = `const apiKey = process.env.FLUXAPAY_API_KEY;

const response = await fetch('https://api.fluxapay.com/api/v1/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${apiKey}\`
  },
  body: JSON.stringify({
    amount: 100.00,
    currency: 'USDC',
    customer_email: 'customer@example.com'
  })
});`;

const pythonBearerExample = `import os
import requests

api_key = os.environ.get('FLUXAPAY_API_KEY')

response = requests.post(
    'https://api.fluxapay.com/api/v1/payments',
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    },
    json={
        'amount': 100.00,
        'currency': 'USDC',
        'customer_email': 'customer@example.com'
    }
)`;

const envExample = `# .env.local
FLUXAPAY_API_KEY=sk_live_abc123def456ghi789jkl

# .env.example (commit this, never commit .env.local)
FLUXAPAY_API_KEY=your_api_key_here`;

const rotationExample = `// Rotate API keys regularly
const response = await fetch(
  'https://api.fluxapay.com/api/v1/keys/regenerate',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_CURRENT_API_KEY'
    }
  }
);

const { new_key, old_key_expires_at } = await response.json();
console.log('New key generated. Old key expires at:', old_key_expires_at);`;

const webhookSignatureExample = `import crypto from 'crypto';

function verifyWebhookSignature(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(signature)
  );
}

// In your webhook handler
app.post('/webhooks/fluxapay', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-fluxapay-signature'];
  
  try {
    const isValid = verifyWebhookSignature(
      req.body,
      signature,
      process.env.FLUXAPAY_WEBHOOK_SECRET
    );
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Process webhook...
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: 'Invalid signature' });
  }
});`;

const pythonWebhookExample = `import hmac
import hashlib

def verify_webhook_signature(payload, signature, secret):
    hash_obj = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    )
    expected_signature = hash_obj.hexdigest()
    return hmac.compare_digest(expected_signature, signature)

# In your webhook handler
@app.route('/webhooks/fluxapay', methods=['POST'])
def webhook():
    signature = request.headers.get('x-fluxapay-signature')
    payload = request.data
    
    try:
        is_valid = verify_webhook_signature(
            payload,
            signature,
            os.environ.get('FLUXAPAY_WEBHOOK_SECRET')
        )
        
        if not is_valid:
            return {'error': 'Invalid signature'}, 401
        
        # Process webhook...
        return {'received': True}
    except Exception as e:
        return {'error': 'Invalid signature'}, 400`;

const bestPractices = [
  {
    title: "Use Environment Variables",
    description: "Never hardcode API keys in your source code. Always use environment variables or a secrets management system.",
    icon: Lock,
  },
  {
    title: "Rotate Keys Regularly",
    description: "Rotate your API keys every 90 days or immediately if you suspect compromise.",
    icon: Shield,
  },
  {
    title: "Use Separate Keys",
    description: "Use different API keys for sandbox and production environments. Never use production keys in development.",
    icon: AlertCircle,
  },
  {
    title: "Verify Webhook Signatures",
    description: "Always verify webhook signatures to ensure requests are genuinely from FluxaPay.",
    icon: CheckCircle,
  },
  {
    title: "Restrict Key Permissions",
    description: "Create API keys with minimal required permissions. Use read-only keys where possible.",
    icon: Lock,
  },
  {
    title: "Monitor Key Usage",
    description: "Regularly review API key usage in your dashboard. Revoke unused keys immediately.",
    icon: Shield,
  },
];

export default function LocalizedAuthenticationPage() {
  return (
    <DocsLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-2">
            Authentication
          </p>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            API Authentication
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl">
            Learn how to authenticate your requests to the FluxaPay API and implement
            security best practices for your integration.
          </p>
        </div>

        {/* Overview */}
        <section className="p-6 rounded-xl border border-amber-200 bg-amber-50">
          <h2 className="text-lg font-bold text-slate-900 mb-2">Authentication Method</h2>
          <p className="text-slate-600">
            FluxaPay uses Bearer token authentication. All API requests must include your API key
            in the <code className="bg-white px-2 py-1 rounded font-mono text-sm">Authorization</code> header.
          </p>
        </section>

        {/* Getting Your API Key */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Getting Your API Key</h2>
          <div className="space-y-4">
            <div className="flex gap-4 p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-amber-600">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Sign in to Dashboard</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Log in to your FluxaPay merchant dashboard at{" "}
                  <a href="https://dashboard.fluxapay.com" className="text-amber-600 hover:underline">
                    dashboard.fluxapay.com
                  </a>
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-amber-600">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Navigate to API Keys</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Go to Settings → API Keys in your dashboard
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-amber-600">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Generate New Key</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Click "Generate New Key" and select the environment (Sandbox or Production)
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-amber-600">4</span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Copy and Store Securely</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Copy your API key and store it securely. You won't be able to see it again!
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Bearer Token Authentication */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Bearer Token Authentication</h2>
          <p className="text-slate-600 mb-4">
            Include your API key as a Bearer token in the Authorization header of every request:
          </p>

          <CodeBlock code={bearerTokenExample} language="typescript" title="TypeScript Example" />
          <CodeBlock code={pythonBearerExample} language="python" title="Python Example" />
        </section>

        {/* Environment Variables */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Managing Credentials</h2>
          <p className="text-slate-600 mb-4">
            Always store your API keys in environment variables, never in your source code:
          </p>

          <CodeBlock code={envExample} language="bash" title="Environment Setup" />

          <div className="mt-4 p-4 rounded-lg border border-red-200 bg-red-50">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">Never commit secrets</p>
                <p className="text-sm text-red-700 mt-1">
                  Add <code className="bg-white px-1 rounded font-mono">.env.local</code> to your{" "}
                  <code className="bg-white px-1 rounded font-mono">.gitignore</code> file to prevent
                  accidentally committing sensitive credentials.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Key Rotation */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Key Rotation</h2>
          <p className="text-slate-600 mb-4">
            Rotate your API keys regularly to maintain security. FluxaPay provides a key rotation endpoint:
          </p>

          <CodeBlock code={rotationExample} language="typescript" title="Rotate API Key" />

          <div className="mt-4 p-4 rounded-lg border border-blue-200 bg-blue-50">
            <p className="text-sm text-blue-900">
              <strong>Tip:</strong> When rotating keys, the old key remains valid for 24 hours to allow
              time for updating your applications. After 24 hours, the old key is automatically revoked.
            </p>
          </div>
        </section>

        {/* Webhook Signature Verification */}
        <section id="webhook-verification">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Webhook Signature Verification</h2>
          <p className="text-slate-600 mb-4">
            All webhook requests from FluxaPay include a signature in the{" "}
            <code className="bg-slate-100 px-2 py-1 rounded font-mono text-sm">x-fluxapay-signature</code> header.
            Always verify this signature to ensure the webhook is genuinely from FluxaPay:
          </p>

          <CodeBlock code={webhookSignatureExample} language="typescript" title="TypeScript Verification" />
          <CodeBlock code={pythonWebhookExample} language="python" title="Python Verification" />

          <div className="mt-4 p-4 rounded-lg border border-amber-200 bg-amber-50">
            <p className="text-sm text-amber-900">
              <strong>Important:</strong> Store your webhook secret securely in an environment variable.
              Never expose it in your client-side code.
            </p>
          </div>
        </section>

        {/* Security Best Practices */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Security Best Practices</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bestPractices.map((practice, index) => {
              const Icon = practice.icon;
              return (
                <div key={index} className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Icon className="h-5 w-5 text-amber-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900">{practice.title}</h3>
                  </div>
                  <p className="text-sm text-slate-600">{practice.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Common Issues */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Troubleshooting</h2>
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <h3 className="font-semibold text-slate-900 mb-2">401 Unauthorized</h3>
              <p className="text-sm text-slate-600">
                This error means your API key is missing, invalid, or expired. Check that:
              </p>
              <ul className="text-sm text-slate-600 mt-2 space-y-1 list-disc list-inside">
                <li>Your API key is correctly set in the Authorization header</li>
                <li>You're using the correct key for the environment (sandbox vs production)</li>
                <li>Your key hasn't been revoked or rotated</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <h3 className="font-semibold text-slate-900 mb-2">429 Too Many Requests</h3>
              <p className="text-sm text-slate-600">
                You've exceeded the rate limit. Implement exponential backoff and retry logic.
                See the Rate Limits documentation for details.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <h3 className="font-semibold text-slate-900 mb-2">Invalid Webhook Signature</h3>
              <p className="text-sm text-slate-600">
                Ensure you're using the correct webhook secret and verifying the signature correctly.
                Use timing-safe comparison functions to prevent timing attacks.
              </p>
            </div>
          </div>
        </section>

        {/* Next Steps */}
        <section className="p-6 rounded-xl border border-amber-200 bg-amber-50">
          <h2 className="text-lg font-bold text-slate-900 mb-2">Next Steps</h2>
          <p className="text-slate-600 mb-4">
            Now that you understand authentication, explore the API reference to start building.
          </p>
          <a
            href="/docs/api-reference"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            View API Reference
          </a>
        </section>

        {/* Edit on GitHub */}
        <div className="pt-4 border-t border-slate-200">
          <EditOnGitHub filePath="fluxapay_frontend/src/app/[locale]/docs/authentication/page.tsx" />
        </div>
      </div>
    </DocsLayout>
  );
}
