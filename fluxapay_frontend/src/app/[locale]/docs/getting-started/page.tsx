import { Metadata } from "next";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { EditOnGitHub } from "@/components/docs/EditOnGitHub";
import { generatePageMetadata } from "@/lib/seo";
import { CheckCircle, ArrowRight, Key, Shield, Zap, Globe } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Getting Started with FluxaPay - Quick Start Guide",
    description: "Learn how to get started with FluxaPay in just a few minutes. Complete integration guide for developers with code examples in TypeScript and Python.",
    slug: "/docs/getting-started",
    keywords: ["getting started", "quick start", "integration", "setup", "tutorial", "API", "payment"],
    locale,
  });
}

const tsInstallExample = `# Using npm
npm install @fluxapay/sdk

# Using yarn
yarn add @fluxapay/sdk

# Using pnpm
pnpm add @fluxapay/sdk`;

const pythonInstallExample = `# Using pip
pip install fluxapay

# Using poetry
poetry add fluxapay`;

const tsSetupExample = `import { FluxaPay } from '@fluxapay/sdk';

// Initialize the client with your API key
const client = new FluxaPay({
  apiKey: process.env.FLUXAPAY_API_KEY!,
  environment: 'sandbox', // Use 'production' for live payments
});

// Create a payment intent
const payment = await client.payments.create({
  amount: 100.00,
  currency: 'USDC',
  customer_email: 'customer@example.com',
  success_url: 'https://yoursite.com/success',
  cancel_url: 'https://yoursite.com/cancel',
});

console.log('Payment URL:', payment.checkout_url);`;

const pythonSetupExample = `from fluxapay import FluxaPay

# Initialize the client with your API key
client = FluxaPay(
    api_key=os.environ.get('FLUXAPAY_API_KEY'),
    environment='sandbox'  # Use 'production' for live payments
)

# Create a payment intent
payment = client.payments.create(
    amount=100.00,
    currency='USDC',
    customer_email='customer@example.com',
    success_url='https://yoursite.com/success',
    cancel_url='https://yoursite.com/cancel'
)

print('Payment URL:', payment.checkout_url)`;

const tsWebhookExample = `import express from 'express';
import { FluxaPay } from '@fluxapay/sdk';

const app = express();
const client = new FluxaPay({ apiKey: process.env.FLUXAPAY_API_KEY! });

// Webhook endpoint to receive payment events
app.post('/webhooks/fluxapay', 
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-fluxapay-signature'] as string;
    
    try {
      // Verify webhook signature
      const event = client.webhooks.verifySignature(
        req.body,
        signature,
        process.env.FLUXAPAY_WEBHOOK_SECRET!
      );
      
      switch (event.type) {
        case 'payment.confirmed':
          console.log('Payment confirmed:', event.data.id);
          // Fulfill the order...
          break;
        case 'payment.failed':
          console.log('Payment failed:', event.data.id);
          // Handle failure...
          break;
      }
      
      res.json({ received: true });
    } catch (err) {
      res.status(400).json({ error: 'Invalid signature' });
    }
  }
);`;

const pythonWebhookExample = `from flask import Flask, request, jsonify
from fluxapay import FluxaPay

app = Flask(__name__)
client = FluxaPay(api_key=os.environ.get('FLUXAPAY_API_KEY'))

@app.route('/webhooks/fluxapay', methods=['POST'])
def webhook():
    signature = request.headers.get('x-fluxapay-signature')
    
    try:
        # Verify webhook signature
        event = client.webhooks.verify_signature(
            request.data,
            signature,
            os.environ.get('FLUXAPAY_WEBHOOK_SECRET')
        )
        
        if event.type == 'payment.confirmed':
            print('Payment confirmed:', event.data.id)
            # Fulfill the order...
        elif event.type == 'payment.failed':
            print('Payment failed:', event.data.id)
            # Handle failure...
        
        return jsonify({'received': True})
    except Exception as e:
        return jsonify({'error': 'Invalid signature'}), 400`;

const checklistItems = [
  {
    title: "Create a merchant account",
    description: "Sign up at dashboard.fluxapay.com to create your merchant account. Complete the basic onboarding to access your dashboard.",
  },
  {
    title: "Generate API keys",
    description: "Navigate to Settings > API Keys in your dashboard. Generate both sandbox and production keys for testing and live transactions.",
  },
  {
    title: "Configure webhook URL",
    description: "Set up a webhook endpoint to receive real-time payment notifications. Configure the URL in your dashboard settings.",
  },
  {
    title: "Test with sandbox",
    description: "Use sandbox mode to test your integration without real transactions. All payments are simulated in this environment.",
  },
  {
    title: "Complete KYC verification",
    description: "Submit required documents for KYC verification to enable production mode and receive real settlements.",
  },
  {
    title: "Go live",
    description: "Switch to production API keys and start accepting real payments. Monitor your dashboard for transaction activity.",
  },
];

export default function LocalizedGettingStartedPage() {
  return (
    <DocsLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-2">
            Getting Started
          </p>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Quick Start Guide
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl">
            Get up and running with FluxaPay in minutes. This guide walks you through
            the essential steps to integrate payments into your application.
          </p>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Zap className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Fast Integration</h3>
            </div>
            <p className="text-sm text-slate-600">
              Integrate in under 10 minutes with our SDKs for TypeScript/JavaScript and Python.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Shield className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Secure by Default</h3>
            </div>
            <p className="text-sm text-slate-600">
              Built-in signature verification, idempotency keys, and secure credential handling.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Globe className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Global Payments</h3>
            </div>
            <p className="text-sm text-slate-600">
              Accept USDC and XLM payments from customers worldwide with automatic fiat settlement.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Key className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Sandbox Testing</h3>
            </div>
            <p className="text-sm text-slate-600">
              Test your integration thoroughly in sandbox mode before going live.
            </p>
          </div>
        </div>

        {/* Installation */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Installation</h2>
          <p className="text-slate-600 mb-4">
            Install the FluxaPay SDK for your preferred language:
          </p>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">TypeScript / JavaScript</h3>
              <CodeBlock code={tsInstallExample} language="bash" title="Install SDK" />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Python</h3>
              <CodeBlock code={pythonInstallExample} language="bash" title="Install SDK" />
            </div>
          </div>
        </section>

        {/* Quick Start */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Quick Start</h2>
          <p className="text-slate-600 mb-4">
            Initialize the client and create your first payment:
          </p>
          
          <CodeBlock code={tsSetupExample} language="typescript" title="TypeScript Example" />
          <CodeBlock code={pythonSetupExample} language="python" title="Python Example" />
        </section>

        {/* Webhooks */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Setting Up Webhooks</h2>
          <p className="text-slate-600 mb-4">
            Webhooks allow you to receive real-time notifications about payment events.
            Set up an endpoint in your application to handle these events:
          </p>
          
          <CodeBlock code={tsWebhookExample} language="typescript" title="TypeScript Webhook Handler" />
          <CodeBlock code={pythonWebhookExample} language="python" title="Python Webhook Handler" />
        </section>

        {/* Integration Checklist */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Integration Checklist</h2>
          <p className="text-slate-600 mb-6">
            Complete these steps to go from signup to production:
          </p>
          
          <div className="space-y-4">
            {checklistItems.map((item, index) => (
              <div
                key={index}
                className="flex gap-4 p-4 rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-amber-600">{index + 1}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Next Steps */}
        <section className="p-6 rounded-xl border border-amber-200 bg-amber-50">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Next Steps</h2>
          <p className="text-slate-600 mb-4">
            Ready to dive deeper? Explore our comprehensive API reference or learn about authentication.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/docs/api-reference"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              API Reference
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="/docs/authentication"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Authentication Guide
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* Edit on GitHub */}
        <div className="pt-4 border-t border-slate-200">
          <EditOnGitHub filePath="fluxapay_frontend/src/app/[locale]/docs/getting-started/page.tsx" />
        </div>
      </div>
    </DocsLayout>
  );
}
