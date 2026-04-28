"use client";

import { Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardDateRange } from "@/features/dashboard/context/DashboardDateRangeContext";
import { cn } from "@/lib/utils";

const inputClass =
  "border border-input bg-background rounded-md px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function DateRangePicker() {
  const { dateRange, setDateRange, setPreset, presets } = useDashboardDateRange();

  // Detect which preset is active by matching from/to dates
  const presetValue = (() => {
    const to = new Date(dateRange.to);
    const from = new Date(dateRange.from);
    const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

    for (const [key, v] of Object.entries(presets)) {
      if (key === "all" && dateRange.from === "2020-01-01") return "all";
      if (key !== "all" && diffDays === v.days) return key;
    }
    return "custom";
  })();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select
        value={presetValue}
        onValueChange={(v) => {
          if (v === "custom") return;
          setPreset(v as keyof typeof presets);
        }}
      >
        <SelectTrigger className={cn(inputClass, "w-[140px]")}>
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(presets).map(([key, { label }]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={dateRange.from}
          onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
          className={cn(inputClass, "w-[130px]")}
          aria-label="From date"
        />
        <span className="text-muted-foreground text-sm">–</span>
        <input
          type="date"
          value={dateRange.to}
          onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
          className={cn(inputClass, "w-[130px]")}
          aria-label="To date"
        />
      </div>
    </div>
  );
}
