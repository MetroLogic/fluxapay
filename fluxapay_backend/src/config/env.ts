import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return raw.toLowerCase() === 'true' || raw === '1';
}

export const env = {
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  port: optionalNumber('PORT', 3000),

  databaseUrl: requireEnv('DATABASE_URL'),

  stellar: {
    network: optionalEnv('STELLAR_NETWORK', 'testnet'),
    horizonUrl: optionalEnv('STELLAR_HORIZON_URL', 'https://horizon-testnet.stellar.org'),
    networkPassphrase: optionalEnv(
      'STELLAR_NETWORK_PASSPHRASE',
      'Test SDF Network ; September 2015',
    ),
    baseReserve: optionalNumber('STELLAR_BASE_RESERVE', 0.5),
    hotWalletPublicKey: optionalEnv('STELLAR_HOT_WALLET_PUBLIC_KEY', ''),
    sweepAccountPublicKey: optionalEnv('STELLAR_SWEEP_ACCOUNT_PUBLIC_KEY', ''),
  },

  reserveMonitor: {
    enabled: optionalBool('RESERVE_MONITOR_ENABLED', true),
    cronSchedule: optionalEnv('RESERVE_MONITOR_CRON', '*/15 * * * *'),
    bufferXlm: optionalNumber('RESERVE_MONITOR_BUFFER_XLM', 5),
    warningThresholdXlm: optionalNumber('RESERVE_MONITOR_WARNING_XLM', 10),
    criticalThresholdXlm: optionalNumber('RESERVE_MONITOR_CRITICAL_XLM', 2),
    usdcWarningThreshold: optionalNumber('RESERVE_MONITOR_USDC_WARNING', 50),
    usdcCriticalThreshold: optionalNumber('RESERVE_MONITOR_USDC_CRITICAL', 10),
    alertWebhookUrl: optionalEnv('RESERVE_MONITOR_ALERT_WEBHOOK_URL', ''),
    alertEmail: optionalEnv('RESERVE_MONITOR_ALERT_EMAIL', ''),
  },
};

export type Env = typeof env;
