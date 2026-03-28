import { z } from 'zod';

/**
 * Environment Configuration with Zod Schema Validation
 * 
 * This module validates all required and optional environment variables on startup.
 * If validation fails, the application exits with a clear error message.
 */

// Define the environment schema
const envSchema = z.object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    BASE_URL: z.string().url().default('http://localhost:3000'),
    PAY_CHECKOUT_BASE: z.string().url().optional(),
    PAYMENT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(5),

    // Database (CRITICAL)
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // JWT (CRITICAL)
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),

    // Cloudinary (optional but recommended for KYC)
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    // Email (optional)
    RESEND_API_KEY: z.string().optional(),

    // SMS OTP (optional) — SMS_PROVIDER: none | mock | twilio | messagebird
    SMS_PROVIDER: z
      .enum(['none', 'mock', 'twilio', 'messagebird'])
      .default('none'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    MESSAGEBIRD_API_KEY: z.string().optional(),
    MESSAGEBIRD_ORIGINATOR: z.string().optional(),
    OTP_SMS_MAX_PER_MERCHANT_HOUR: z.coerce.number().int().positive().default(10),
    OTP_SMS_COST_ALERT_DAILY_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(1000),

    // Webhook
    WEBHOOK_SECRET: z.string().optional(),

    // Stellar (CRITICAL)
    STELLAR_HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
    STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
    FUNDER_SECRET_KEY: z.string().min(1, 'FUNDER_SECRET_KEY is required'),
    USDC_ISSUER_PUBLIC_KEY: z.string().min(1, 'USDC_ISSUER_PUBLIC_KEY is required'),
    MASTER_VAULT_SECRET_KEY: z.string().min(1, 'MASTER_VAULT_SECRET_KEY is required'),
    FUNDER_PUBLIC_KEY: z.string().optional(),
    SWEEP_ENABLE_ACCOUNT_MERGE: z.enum(['true', 'false']).default('false'),
    SWEEP_CRON: z.string().default('*/5 * * * *'),
    SWEEP_LOCK_TTL_MS: z.coerce.number().int().positive().default(600000),

    // KMS Configuration (CRITICAL)
    KMS_PROVIDER: z.enum(['local', 'aws']).default('local'),
    KMS_ENCRYPTION_PASSPHRASE: z.string().optional(),
    KMS_ENCRYPTED_MASTER_SEED: z.string().optional(),
    HD_WALLET_MASTER_SEED: z.string().optional(), // Legacy, deprecated

    // AWS KMS (conditional - required if KMS_PROVIDER=aws)
    AWS_KMS_KEY_ID: z.string().optional(),
    AWS_REGION: z.string().default('us-east-1'),

    // Soroban Smart Contracts (optional)
    SOROBAN_RPC_URL: z.string().url().optional(),
    SOROBAN_NETWORK_PASSPHRASE: z.string().optional(),
    MERCHANT_REGISTRY_CONTRACT_ID: z.string().optional(),
    PAYMENT_CONTRACT_ID: z.string().optional(),
    ADMIN_SECRET_KEY: z.string().optional(),

    // Settlement Batch
    EXCHANGE_PARTNER: z.enum(['yellowcard', 'anchor', 'mock']).default('mock'),
    YELLOWCARD_API_KEY: z.string().optional(),
    YELLOWCARD_API_URL: z.string().url().optional(),
    ANCHOR_API_KEY: z.string().optional(),
    ANCHOR_API_URL: z.string().url().optional(),
    SETTLEMENT_FEE_PERCENT: z.coerce.number().nonnegative().default(2),
    SETTLEMENT_CRON: z.string().default('0 0 * * *'),
    SETTLEMENT_BATCH_LIMIT: z.coerce.number().int().positive().default(500),

    // Cron Jobs
    PAYMENT_MONITOR_CRON: z.string().default('*/2 * * * *'),
    BILLING_CRON: z.string().default('0 1 * * *'),
    FUNDER_MONITOR_CRON: z.string().default('*/10 * * * *'),
    DISABLE_CRON: z.enum(['true', 'false']).default('false'),

    // Admin
    ADMIN_INTERNAL_SECRET: z.string().optional(),

    // Docker Compose (optional)
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DB: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Custom error class for environment validation failures
 */
export class EnvValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EnvValidationError';
    }
}

/**
 * Validates environment variables and returns parsed config
 * Throws EnvValidationError with detailed messages if validation fails
 */
export function validateEnv(): EnvConfig {
    const env = process.env;

    const result = envSchema.safeParse(env);

    if (!result.success) {
        const errors = result.error.issues.map((issue) => {
            const path = issue.path.join('.');
            return `  • ${path}: ${issue.message}`;
        });

        const errorMessage = [
            '❌ Environment Validation Failed',
            '',
            'Missing or invalid environment variables:',
            ...errors,
            '',
            'Please check your .env file and ensure all required variables are set.',
            'See .env.example for reference.',
        ].join('\n');

        throw new EnvValidationError(errorMessage);
    }

    // Additional conditional validations
    const config = result.data;

    // Validate conditional requirements
    const conditionalErrors: string[] = [];

    // AWS KMS validation
    if (config.KMS_PROVIDER === 'aws' && !config.AWS_KMS_KEY_ID) {
        conditionalErrors.push('  • AWS_KMS_KEY_ID is required when KMS_PROVIDER=aws');
    }

    // Settlement partner validation
    if (config.EXCHANGE_PARTNER === 'yellowcard' && !config.YELLOWCARD_API_KEY) {
        conditionalErrors.push('  • YELLOWCARD_API_KEY is required when EXCHANGE_PARTNER=yellowcard');
    }

    if (config.EXCHANGE_PARTNER === 'anchor' && !config.ANCHOR_API_KEY) {
        conditionalErrors.push('  • ANCHOR_API_KEY is required when EXCHANGE_PARTNER=anchor');
    }

    if (config.SMS_PROVIDER === 'twilio') {
        if (!config.TWILIO_ACCOUNT_SID) {
            conditionalErrors.push('  • TWILIO_ACCOUNT_SID is required when SMS_PROVIDER=twilio');
        }
        if (!config.TWILIO_AUTH_TOKEN) {
            conditionalErrors.push('  • TWILIO_AUTH_TOKEN is required when SMS_PROVIDER=twilio');
        }
        if (!config.TWILIO_FROM_NUMBER) {
            conditionalErrors.push('  • TWILIO_FROM_NUMBER is required when SMS_PROVIDER=twilio');
        }
    }

    if (config.SMS_PROVIDER === 'messagebird') {
        if (!config.MESSAGEBIRD_API_KEY) {
            conditionalErrors.push('  • MESSAGEBIRD_API_KEY is required when SMS_PROVIDER=messagebird');
        }
    }

    // KMS seed validation
    if (config.KMS_PROVIDER === 'local' && !config.KMS_ENCRYPTED_MASTER_SEED && !config.HD_WALLET_MASTER_SEED) {
        conditionalErrors.push('  • KMS_ENCRYPTED_MASTER_SEED or HD_WALLET_MASTER_SEED is required when KMS_PROVIDER=local');
    }

    if (conditionalErrors.length > 0) {
        const errorMessage = [
            '❌ Conditional Environment Validation Failed',
            '',
            'Missing required environment variables based on configuration:',
            ...conditionalErrors,
            '',
            'Please check your .env file and ensure all required variables are set.',
            'See .env.example for reference.',
        ].join('\n');

        throw new EnvValidationError(errorMessage);
    }

    return config;
}

/**
 * Get the validated environment config
 * This is called once at startup and cached
 */
let cachedConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
    if (!cachedConfig) {
        cachedConfig = validateEnv();
    }
    return cachedConfig;
}

/**
 * Reset cached config (useful for testing)
 */
export function resetEnvConfig(): void {
    cachedConfig = null;
}
