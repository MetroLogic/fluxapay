/**
 * Sweep job configuration — interval and minimum balance threshold.
 *
 * SWEEP_CRON_INTERVAL takes precedence over the legacy SWEEP_CRON env var.
 */

const DEFAULT_SWEEP_CRON_INTERVAL = "0 * * * *";
const DEFAULT_SWEEP_MIN_BALANCE_USDC = 0.5;

export interface SweepConfig {
  /** Cron expression for the scheduled sweep job. */
  cronInterval: string;
  /** Minimum on-chain USDC balance required before sweeping an address. */
  minBalanceUsdc: number;
}

export function getSweepCronInterval(): string {
  return (
    process.env.SWEEP_CRON_INTERVAL ??
    process.env.SWEEP_CRON ??
    DEFAULT_SWEEP_CRON_INTERVAL
  );
}

export function getSweepMinBalanceUsdc(): number {
  const raw = process.env.SWEEP_MIN_BALANCE_USDC;
  if (raw === undefined || raw === "") {
    return DEFAULT_SWEEP_MIN_BALANCE_USDC;
  }
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_SWEEP_MIN_BALANCE_USDC;
  }
  return parsed;
}

export function getSweepConfig(): SweepConfig {
  return {
    cronInterval: getSweepCronInterval(),
    minBalanceUsdc: getSweepMinBalanceUsdc(),
  };
}

export function logSweepConfigAtStartup(): void {
  const { cronInterval, minBalanceUsdc } = getSweepConfig();
  console.log(
    JSON.stringify({
      level: "info",
      message: "Sweep configuration loaded",
      sweepCronInterval: cronInterval,
      sweepMinBalanceUsdc: minBalanceUsdc,
    }),
  );
}
