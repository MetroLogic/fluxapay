import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Fluxapay API',
            version: '1.0.0',
            description:
                'API documentation for Fluxapay Backend.\n\n' +
                '**Request size limits:** JSON request bodies are limited to **1MB** (`REQUEST_BODY_SIZE_LIMIT`). ' +
                'Multipart file uploads are limited to **10MB** per file.',
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Local development server',
            },
            {
                url: 'https://api.fluxapay.com',
                description: 'Production server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
                apiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                },
                adminSecret: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-admin-secret',
                },
            },
            schemas: {
                ErrorResponse: {
                    type: 'object',
                    required: ['code', 'message'],
                    properties: {
                        code: {
                            type: 'string',
                            description: 'Machine-readable error code',
                            enum: [
                                'INVALID_API_KEY', 'MERCHANT_NOT_FOUND', 'PAYMENT_NOT_FOUND',
                                'RATE_LIMIT_EXCEEDED', 'PLAN_LIMIT_EXCEEDED', 'VALIDATION_ERROR',
                                'PAYLOAD_TOO_LARGE', 'FILE_TOO_LARGE', 'FORBIDDEN', 'INTERNAL_ERROR',
                            ],
                            example: 'VALIDATION_ERROR',
                        },
                        message: {
                            type: 'string',
                            example: 'Validation failed',
                        },
                        details: {
                            type: 'object',
                            additionalProperties: true,
                        },
                        errors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    field: { type: 'string', example: 'amount' },
                                    message: { type: 'string', example: 'Amount must be greater than 0' },
                                },
                            },
                        },
                        retry_after_seconds: {
                            type: 'integer',
                            example: 60,
                        },
                    },
                },
                CreatePaymentRequest: {
                    type: 'object',
                    required: ['amount', 'currency', 'customer_email', 'metadata'],
                    properties: {
                        amount: { type: 'number', example: 150.0 },
                        currency: { type: 'string', example: 'USDC' },
                        customer_email: { type: 'string', example: 'alice@example.com' },
                        customer_id: {
                            type: 'string',
                            description: 'Optional Customer id (must belong to the authenticated merchant)',
                            example: 'seed-customer-alice',
                        },
                        metadata: {
                            type: 'object',
                            additionalProperties: true,
                            example: { order_id: 'ord_001', webhook_url: 'https://webhook.site/fluxapay-demo' },
                        },
                    },
                    examples: {
                        ProSubscription: {
                            summary: 'Pro plan subscription',
                            value: {
                                amount: 150.0, currency: 'USDC', customer_email: 'alice@example.com',
                                customer_id: 'seed-customer-alice',
                                metadata: { order_id: 'ord_001', plan: 'pro', stellar_address: 'GBUQWP3BOUZX34ULNQG23RQ6F5DOBAB4NSTOF5AUFF6GPBK476QC6G5' },
                            },
                        },
                        StarterPlan: {
                            summary: 'Starter plan payment',
                            value: {
                                amount: 75.5, currency: 'USDC', customer_email: 'bob@example.com',
                                metadata: { order_id: 'ord_002', plan: 'starter' },
                            },
                        },
                    },
                },
                CreateCustomerRequest: {
                    type: 'object',
                    required: ['email'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'alice@example.com' },
                        metadata: {
                            type: 'object',
                            additionalProperties: true,
                            example: { plan: 'pro', region: 'us-east' },
                        },
                    },
                    examples: {
                        ProCustomer: {
                            summary: 'Pro plan customer',
                            value: { email: 'alice@example.com', metadata: { plan: 'pro', region: 'us-east' } },
                        },
                        StarterCustomer: {
                            summary: 'Starter plan customer',
                            value: { email: 'bob@example.com', metadata: { plan: 'starter' } },
                        },
                    },
                },
                UpdateCustomerRequest: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', format: 'email' },
                        metadata: { type: 'object', additionalProperties: true },
                    },
                    description: 'At least one of email or metadata should be provided',
                    examples: {
                        UpdateEmail: {
                            summary: 'Update email address',
                            value: { email: 'alice-new@example.com' },
                        },
                        UpgradePlan: {
                            summary: 'Upgrade plan in metadata',
                            value: { metadata: { plan: 'enterprise', region: 'eu-west' } },
                        },
                    },
                },
                CreateInvoiceRequest: {
                    type: 'object',
                    required: ['amount', 'currency', 'customer_email'],
                    properties: {
                        amount: { type: 'number', example: 250.0 },
                        currency: { type: 'string', example: 'USDC' },
                        customer_email: { type: 'string', example: 'alice@example.com' },
                        due_date: { type: 'string', format: 'date-time' },
                        metadata: {
                            type: 'object',
                            additionalProperties: true,
                            example: { invoice_ref: 'inv-2026-0099' },
                        },
                    },
                    examples: {
                        NetThirty: {
                            summary: 'Net-30 invoice',
                            value: {
                                amount: 250.0, currency: 'USDC', customer_email: 'alice@example.com',
                                due_date: '2026-08-28T00:00:00.000Z',
                                metadata: { invoice_ref: 'inv-2026-0099' },
                            },
                        },
                        OverdueInvoice: {
                            summary: 'Past-due invoice',
                            value: {
                                amount: 99.0, currency: 'USDC', customer_email: 'carol@example.com',
                                due_date: '2026-07-26T00:00:00.000Z',
                                metadata: { invoice_ref: 'inv-2026-0003' },
                            },
                        },
                    },
                },
                CreateRefundRequest: {
                    type: 'object',
                    required: ['payment_id', 'amount'],
                    properties: {
                        payment_id: { type: 'string', example: 'seed-pay-001' },
                        amount: { type: 'number', example: 50.0 },
                        reason: { type: 'string', example: 'Partial cancellation' },
                    },
                    examples: {
                        PartialRefund: {
                            summary: 'Partial refund on confirmed payment',
                            value: { payment_id: 'seed-pay-001', amount: 50.0, reason: 'Partial cancellation' },
                        },
                        FullRefund: {
                            summary: 'Full refund',
                            value: { payment_id: 'seed-pay-005', amount: 300.0, reason: 'Order cancelled by customer' },
                        },
                    },
                },
                UpdateRefundStatusRequest: {
                    type: 'object',
                    required: ['status'],
                    properties: {
                        status: {
                            type: 'string',
                            enum: ['pending', 'processing', 'completed', 'failed'],
                            example: 'completed',
                        },
                        failed_reason: { type: 'string', example: 'Settlement window expired' },
                    },
                    examples: {
                        MarkCompleted: {
                            summary: 'Mark refund as completed',
                            value: { status: 'completed' },
                        },
                        MarkFailed: {
                            summary: 'Mark refund as failed',
                            value: { status: 'failed', failed_reason: 'Settlement window expired' },
                        },
                    },
                },
                UpsertDiscrepancyThresholdRequest: {
                    type: 'object',
                    required: ['amount_threshold', 'percent_threshold'],
                    properties: {
                        merchant_id: { type: 'string', nullable: true, example: 'cm123abc' },
                        amount_threshold: { type: 'number', example: 100 },
                        percent_threshold: { type: 'number', example: 2.5 },
                        is_active: { type: 'boolean', example: true },
                    },
                    examples: {
                        GlobalThreshold: {
                            summary: 'Global threshold (all merchants)',
                            value: { merchant_id: null, amount_threshold: 100, percent_threshold: 2.5, is_active: true },
                        },
                        MerchantThreshold: {
                            summary: 'Merchant-specific threshold',
                            value: { merchant_id: 'cm123abc', amount_threshold: 50, percent_threshold: 1.5, is_active: true },
                        },
                    },
                },
                WebhookEventType: {
                    type: 'string',
                    enum: [
                        'payment.created',
                        'payment.pending',
                        'payment.confirmed',
                        'payment.failed',
                        'payment.settled',
                        'refund.created',
                        'refund.completed',
                        'refund.failed',
                        'subscription.created',
                        'subscription.cancelled',
                        'subscription.renewed',
                    ],
                    description: 'Canonical webhook event names. Legacy names (payment_completed, etc.) are supported for backward compatibility.',
                    example: 'payment.confirmed',
                },
                Merchant: {
                    type: 'object',
                    description: 'Merchant account (subset for documentation / contract tests)',
                    properties: {
                        id: { type: 'string' },
                        business_name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        phone_number: { type: 'string' },
                        country: { type: 'string' },
                        settlement_currency: { type: 'string' },
                        status: { type: 'string' },
                        webhook_url: { type: 'string', nullable: true },
                        created_at: { type: 'string', format: 'date-time' },
                        updated_at: { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
        tags: [
            {
                name: 'Merchants',
                description: 'Merchant authentication and management',
            },
            {
                name: 'Admin - Merchants',
                description: 'Admin endpoints for merchant management',
            },
            {
                name: 'KYC',
                description: 'Know Your Customer verification',
            },
            {
                name: 'KYC Admin',
                description: 'Admin endpoints for KYC management',
            },
            {
                name: 'Payments',
                description: 'Payment intent APIs',
            },
            {
                name: 'Invoices',
                description: 'Invoice APIs with linked payment intents',
            },
            {
                name: 'Customers',
                description: 'Merchant-scoped customer records linked to payments',
            },
            {
                name: 'Refunds',
                description: 'Refund lifecycle APIs and webhook events',
            },
            {
                name: 'Webhooks',
                description: 'Webhook delivery logs and retry operations',
            },
            {
                name: 'Webhooks — Admin',
                description: 'Admin endpoints for webhook DLQ management',
            },
            {
                name: 'Settlements',
                description: 'Settlement listing and reporting',
            },
            {
                name: 'Admin - Settlement',
                description: 'Admin endpoints for settlement batch management',
            },
            {
                name: 'Admin - Sweep',
                description: 'Admin endpoints for sweeping funds',
            },
            {
                name: 'Reconciliation',
                description: 'Admin reconciliation records, thresholds, and discrepancy alerts',
            },
            {
                name: 'Dashboard',
                description: 'Merchant dashboard metrics and analytics',
            },
            {
                name: 'Admin',
                description: 'General admin endpoints',
            },
            {
                name: 'Oracle',
                description: 'Payment verification oracle monitoring',
            },
        ],
    },
    apis: ['./src/routes/*.ts', './src/controllers/*.ts'], // Path to the API docs
};

export const specs = swaggerJsdoc(options);
