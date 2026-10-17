"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, RefreshCw, TrendingUp } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { useDashboardFxRates } from "@/hooks/useDashboardFxRates";
import type { DashboardFxRate } from "@/lib/api";

function formatRate(value: number, pair: DashboardFxRate["pair"]): string {
  const maximumFractionDigits = pair === "USDC/NGN" ? 2 : 6;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: pair === "USDC/NGN" ? 2 : 0,
  }).format(value);
}

function relativeTime(timestamp: string, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1000));
  if (elapsedSeconds < 60) return "Updated just now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `Updated ${hours}h ago`;
}

function RatePanel({ rate }: { rate: DashboardFxRate }) {
  const isPositive = (rate.change24h ?? 0) >= 0;
  const lineColor = isPositive ? "#16845b" : "#bd3f45";

  return (
    <section className="min-w-0 border-t border-border pt-4 first:border-t-0 first:pt-0 md:border-l md:border-t-0 md:pl-4 md:pt-0 first:md:border-l-0 first:md:pl-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{rate.pair}</h3>
        {rate.change24h !== null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-emerald-700" : "text-rose-700"}`}>
            {isPositive ? <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /> : <ArrowDownRight aria-hidden="true" className="h-3.5 w-3.5" />}
            {Math.abs(rate.change24h).toFixed(2)}%
            <span className="sr-only">change in the last 24 hours</span>
          </span>
        )}
      </div>

      {rate.error || rate.rate === null ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">Rate temporarily unavailable</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatRate(rate.rate, rate.pair)}
          </p>
          <div className="mt-2 h-14 w-full" role="group" aria-label={`${rate.pair} rate trend for the last 24 hours`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rate.points} accessibilityLayer>
                <XAxis dataKey="timestamp" hide />
                <Tooltip
                  labelFormatter={(label) => new Date(String(label)).toLocaleString()}
                  formatter={(value) => [formatRate(Number(value), rate.pair), rate.pair]}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    borderColor: "var(--color-border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke={lineColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="sr-only">Move through chart points with the arrow keys to inspect precise rates and timestamps.</p>
        </>
      )}
    </section>
  );
}

export function FxRatesCard() {
  const { rates, error, isLoading, isRefreshing, refresh } = useDashboardFxRates();
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const updatedAt = rates?.reduce<string | undefined>((latest, rate) =>
    !latest || new Date(rate.updatedAt).getTime() > new Date(latest).getTime() ? rate.updatedAt : latest,
  undefined);

  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground" aria-labelledby="fx-rates-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="fx-rates-heading" className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp aria-hidden="true" className="h-4 w-4 text-emerald-700" />
            Currency markets
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            24-hour movement{updatedAt && now ? ` · ${relativeTime(updatedAt, now)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          aria-label="Refresh currency rates"
          title="Refresh currency rates"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3" aria-label="Loading currency rates" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="animate-pulse border-t border-border pt-3 first:border-t-0 first:pt-0 md:border-l md:border-t-0 md:pl-4 md:pt-0 first:md:border-l-0 first:md:pl-0">
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="mt-3 h-7 w-28 rounded bg-muted" />
              <div className="mt-3 h-14 rounded bg-muted/70" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-4 py-3" role="alert">
          <p className="text-sm text-muted-foreground">Currency rates could not be loaded.</p>
          <button type="button" onClick={() => void refresh()} className="text-sm font-medium text-foreground underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {rates?.map((rate) => <RatePanel key={rate.pair} rate={rate} />)}
        </div>
      )}
    </section>
  );
}