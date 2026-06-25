"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type DateRange = { from: string; to: string };

const PRESETS = {
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
  "all": { label: "All time", days: 0 },
} as const;

function toISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPresetRange(key: keyof typeof PRESETS): DateRange {
  const to = new Date();
  if (key === "all") {
    return { from: "2020-01-01", to: toISO(to) };
  }
  const from = new Date();
  from.setDate(from.getDate() - PRESETS[key].days);
  return { from: toISO(from), to: toISO(to) };
}

const defaultRange = getPresetRange("30d");

interface DashboardDateRangeContextValue {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  setPreset: (key: keyof typeof PRESETS) => void;
  presets: typeof PRESETS;
}

const DashboardDateRangeContext = createContext<DashboardDateRangeContextValue | null>(null);

export function DashboardDateRangeProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRangeState] = useState<DateRange>(defaultRange);

  const setDateRange = useCallback((range: DateRange) => {
    setDateRangeState(range);
  }, []);

  const setPreset = useCallback((key: keyof typeof PRESETS) => {
    setDateRangeState(getPresetRange(key));
  }, []);

  const value = useMemo(
    () => ({
      dateRange,
      setDateRange,
      setPreset,
      presets: PRESETS,
    }),
    [dateRange, setDateRange, setPreset]
  );

  return (
    <DashboardDateRangeContext.Provider value={value}>
      {children}
    </DashboardDateRangeContext.Provider>
  );
}

export function useDashboardDateRange() {
  const ctx = useContext(DashboardDateRangeContext);
  if (!ctx) {
    throw new Error("useDashboardDateRange must be used within DashboardDateRangeProvider");
  }
  return ctx;
}
