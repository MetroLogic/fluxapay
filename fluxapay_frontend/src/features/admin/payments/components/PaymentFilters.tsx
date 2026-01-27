import { PaymentFilterState, PaymentStatus } from "../types";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Search, X, Calendar } from "lucide-react";
import { useState, useEffect } from "react";

interface PaymentFiltersProps {
  filters: PaymentFilterState;
  onFilterChange: (filters: PaymentFilterState) => void;
}

export function PaymentFilters({
  filters,
  onFilterChange,
}: PaymentFiltersProps) {
  const [localMerchant, setLocalMerchant] = useState(filters.merchant || "");

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localMerchant !== filters.merchant) {
        onFilterChange({ ...filters, merchant: localMerchant });
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [localMerchant, onFilterChange, filters]);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({
      ...filters,
      status: e.target.value as PaymentStatus | "all",
    });
  };

  const clearFilters = () => {
    setLocalMerchant("");
    onFilterChange({
      merchant: "",
      status: "all",
      dateRange: { from: undefined, to: undefined },
    });
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between p-1">
      {/* Search */}
      <div className="relative w-full md:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search merchant or ID..."
          className="pl-9"
          value={localMerchant}
          onChange={(e) => setLocalMerchant(e.target.value)}
        />
      </div>

      {/* Filters Group */}
      <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
        {/* Status Dropdown - Using standard select for simplicity/speed avoiding complex UI libs */}
        <div className="relative">
          <select
            className="h-10 w-full md:w-40 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.status || "all"}
            onChange={handleStatusChange}
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="h-10 border border-input rounded-md flex items-center bg-background px-2 overflow-hidden w-auto">
          <Calendar className="h-4 w-4 text-muted-foreground mr-2" />
          <input
            type="date"
            className="bg-transparent text-sm outline-none w-32"
            placeholder="From"
            onChange={(e) =>
              onFilterChange({
                ...filters,
                dateRange: {
                  ...filters.dateRange,
                  from: e.target.value ? new Date(e.target.value) : undefined,
                  to: filters.dateRange?.to,
                },
              })
            }
          />
          <span className="text-muted-foreground mx-1">-</span>
          <input
            type="date"
            className="bg-transparent text-sm outline-none w-32"
            onChange={(e) =>
              onFilterChange({
                ...filters,
                dateRange: {
                  ...filters.dateRange,
                  to: e.target.value ? new Date(e.target.value) : undefined,
                  from: filters.dateRange?.from,
                },
              })
            }
          />
        </div>

        {(filters.merchant ||
          (filters.status && filters.status !== "all") ||
          filters.dateRange?.from) && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearFilters}
            title="Clear filters"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
