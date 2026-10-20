"use client";

import { useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import {
  DATE_RANGE_PRESETS,
  resolveDateRangePreset,
  type DateRangePreset,
} from "@/services/transactionCsvExport.service";

export interface DateRangeFilterProps {
  /** Inclusive start bound, as YYYY-MM-DD (empty when unbounded). */
  from: string;
  /** Inclusive end bound, as YYYY-MM-DD (empty when unbounded). */
  to: string;
  /** Called with the resolved range whenever the preset or a bound changes. */
  onChange: (range: { from: string; to: string }) => void;
  /**
   * Preset options to offer. Defaults to the shared export presets. Pass a
   * subset to tailor the picker to a specific table (e.g. #1251).
   */
  presets?: ReadonlyArray<{ value: DateRangePreset; label: string }>;
  className?: string;
}

/** Presets surfaced on the transactions table filter bar (#1251). */
export const TRANSACTIONS_DATE_RANGE_PRESETS: ReadonlyArray<{
  value: DateRangePreset;
  label: string;
}> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "ytd", label: "Year to Date" },
  { value: "custom", label: "Custom" },
];

/**
 * Reusable date-range picker (#1251): quick presets plus custom From/To dates.
 * Controlled via `from`/`to` so the parent owns the URL-synced filter state.
 */
export function DateRangeFilter({
  from,
  to,
  onChange,
  presets = DATE_RANGE_PRESETS,
  className = "",
}: DateRangeFilterProps) {
  const [preset, setPreset] = useState<DateRangePreset>("custom");

  // Detect whether the current bounds match a preset so the select reflects
  // external changes (URL load, reset, saved preset) without fighting the user.
  useEffect(() => {
    if (!from && !to) {
      setPreset("all");
      return;
    }
    const match = presets.find((option) => {
      if (option.value === "custom") return false;
      const range = resolveDateRangePreset(option.value);
      return range.from === from && range.to === to;
    });
    setPreset(match ? match.value : "custom");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const handlePresetChange = (value: DateRangePreset) => {
    setPreset(value);
    if (value === "custom") return;
    const range = resolveDateRangePreset(value);
    onChange(range);
  };

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-2 ${className}`.trim()}
      data-testid="date-range-filter"
    >
      <div className="relative flex items-center">
        <CalendarRange
          aria-hidden="true"
          className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
        />
        <Select
          aria-label="Date range"
          className="w-full pl-9 sm:w-[150px]"
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value as DateRangePreset)}
        >
          {presets.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <Input
        type="date"
        aria-label="From date"
        title="From date"
        className="w-full sm:w-[150px]"
        value={from}
        max={to || undefined}
        onChange={(e) => {
          setPreset("custom");
          onChange({ from: e.target.value, to });
        }}
      />

      <Input
        type="date"
        aria-label="To date"
        title="To date"
        className="w-full sm:w-[150px]"
        value={to}
        min={from || undefined}
        onChange={(e) => {
          setPreset("custom");
          onChange({ from, to: e.target.value });
        }}
      />
    </div>
  );
}
