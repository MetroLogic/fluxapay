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

  const presetValue =
    Object.entries(presets).find(([, v]) => {
      const from = new Date(dateRange.from);
      const to = new Date(dateRange.to);
      const diff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      return diff === v.days;
    })?.[0] ?? "custom";

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
