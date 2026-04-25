"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import type { RevenueByCountry, PaymentDistribution, RevenueTrends, AnalyticsSummary } from "@/services/analytics";

interface BackendMetrics {
  total_revenue?: number;
  total_payments?: number;
  active_merchants?: number;
  growth_rate?: number;
  // overview endpoint may also return these keys
  totalRevenue?: number;
  totalPayments?: number;
  activeMerchants?: number;
  growthRate?: number;
}

interface BackendChartPoint {
  date?: string;
  name?: string;
  revenue?: number;
  volume?: number;
  value?: number;
  country?: string;
  method?: string;
  color?: string;
  target?: number;
}

interface BackendCharts {
  revenue_trends?: BackendChartPoint[];
  revenueTrends?: BackendChartPoint[];
  payment_distribution?: BackendChartPoint[];
  paymentDistribution?: BackendChartPoint[];
  revenue_by_country?: BackendChartPoint[];
  revenueByCountry?: BackendChartPoint[];
}

export interface DashboardAnalyticsData {
  summary: AnalyticsSummary;
  revenueTrends: RevenueTrends[];
  paymentDistribution: PaymentDistribution[];
  revenueByCountry: RevenueByCountry[];
}

function mapMetrics(raw: BackendMetrics): AnalyticsSummary {
  return {
    totalRevenue: raw.total_revenue ?? raw.totalRevenue ?? 0,
    totalPayments: raw.total_payments ?? raw.totalPayments ?? 0,
    activeMerchants: raw.active_merchants ?? raw.activeMerchants ?? 0,
    growthRate: raw.growth_rate ?? raw.growthRate ?? 0,
  };
}

function mapRevenueTrends(points: BackendChartPoint[]): RevenueTrends[] {
  return points.map((p) => ({
    date: p.date ?? p.name ?? "",
    revenue: p.revenue ?? p.value ?? 0,
    target: p.target,
  }));
}

function mapPaymentDistribution(points: BackendChartPoint[]): PaymentDistribution[] {
  return points.map((p) => ({
    method: p.method ?? p.name ?? "Unknown",
    value: p.value ?? 0,
    color: p.color,
  }));
}

function mapRevenueByCountry(points: BackendChartPoint[]): RevenueByCountry[] {
  return points.map((p) => ({
    country: p.country ?? p.name ?? "Unknown",
    revenue: p.revenue ?? p.value ?? 0,
    payments: 0,
  }));
}

export function useDashboardAnalytics(params: { from?: string; to?: string } = {}) {
  const metricsKey = ["dashboard-analytics-metrics", params.from, params.to];
  const chartsKey = ["dashboard-analytics-charts", params.from, params.to];

  const {
    data: metricsData,
    error: metricsError,
    isLoading: metricsLoading,
  } = useSWR<{ data?: BackendMetrics } & BackendMetrics>(
    metricsKey,
    () => api.dashboard.overviewMetrics({ from: params.from, to: params.to }) as Promise<{ data?: BackendMetrics } & BackendMetrics>
  );

  const {
    data: chartsData,
    error: chartsError,
    isLoading: chartsLoading,
  } = useSWR<{ data?: BackendCharts } & BackendCharts>(
    chartsKey,
    () => api.dashboard.charts({ from: params.from, to: params.to }) as Promise<{ data?: BackendCharts } & BackendCharts>
  );

  const isLoading = metricsLoading || chartsLoading;
  const error = metricsError ?? chartsError ?? null;

  const rawMetrics: BackendMetrics = (metricsData?.data ?? metricsData) as BackendMetrics ?? {};
  const rawCharts: BackendCharts = (chartsData?.data ?? chartsData) as BackendCharts ?? {};

  const summary = mapMetrics(rawMetrics);

  const revenueTrends = mapRevenueTrends(
    rawCharts.revenue_trends ?? rawCharts.revenueTrends ?? []
  );

  const paymentDistribution = mapPaymentDistribution(
    rawCharts.payment_distribution ?? rawCharts.paymentDistribution ?? []
  );

  const revenueByCountry = mapRevenueByCountry(
    rawCharts.revenue_by_country ?? rawCharts.revenueByCountry ?? []
  );

  return {
    summary,
    revenueTrends,
    paymentDistribution,
    revenueByCountry,
    isLoading,
    error,
  };
}
