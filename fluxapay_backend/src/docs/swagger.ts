import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Fluxapay API',
            version: '1.0.0',
            description: 'API documentation for Fluxapay Backend',
        },
        servers: [
            {
                url: 'http://localhost:3000/api/v1',
                description: 'Local server',
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
            },
            schemas: {
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'string',
                            example: 'Validation failed',
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
                    },
                },
                CreatePaymentRequest: {
                    type: 'object',
                    required: ['amount', 'currency', 'customer_email', 'metadata'],
                    properties: {
                        amount: { type: 'number', example: 120.5 },
                        currency: { type: 'string', example: 'USDC' },
                        customer_email: { type: 'string', example: 'buyer@example.com' },
                        customer_id: {
                            type: 'string',
                            description: 'Optional Customer id (must belong to the authenticated merchant)',
                            example: 'clxyz123customer',
                        },
                        metadata: {
                            type: 'object',
                            additionalProperties: true,
                            example: { order_id: 'ord_001', webhook_url: 'https://merchant.tld/webhooks' },
                        },
                    },
                },
                CreateCustomerRequest: {
                    type: 'object',
                    required: ['email'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'buyer@example.com' },
                        metadata: {
                            type: 'object',
                            additionalProperties: true,
                            example: { plan: 'pro' },
                        },
                    },
                },
                UpdateCustomerRequest: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', format: 'email' },
                        metadata: {
                            type: 'object',
                            additionalProperties: true,
                        },
                    },
                    description: 'At least one of email or metadata should be provided',
                },
                CreateInvoiceRequest: {
                    type: 'object',
                    required: ['amount', 'currency', 'customer_email'],
                    properties: {
                        amount: { type: 'number', example: 250.0 },
                        currency: { type: 'string', example: 'USDC' },
                        customer_email: { type: 'string', example: 'customer@example.com' },
                        due_date: { type: 'string', format: 'date-time' },
                        metadata: {
                            type: 'object',
                            additionalProperties: true,
                            example: { invoice_ref: 'inv-2026-0099' },
                        },
                    },
                },
                CreateRefundRequest: {
                    type: 'object',
                    required: ['payment_id', 'amount'],
                    properties: {
                        payment_id: { type: 'string', example: 'pay_123' },
                        amount: { type: 'number', example: 50.0 },
                        reason: { type: 'string', example: 'Partial cancellation' },
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
                description: 'Webhook delivery logs and retry operations. Event names follow canonical format (e.g., payment.created, payment.confirmed). Legacy names (payment_completed, etc.) are supported for backward compatibility.',
            },
            {
                name: 'Settlements',
                description: 'Settlement listing and reporting',
            },
            {
                name: 'Reconciliation',
                description: 'Admin reconciliation records, thresholds, and discrepancy alerts',
            },
        ],
    },
    apis: ['./src/routes/*.ts', './src/controllers/*.ts'], // Path to the API docs
};

export const specs = swaggerJsdoc(options);
