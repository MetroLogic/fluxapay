/**
 * Example: Debounced version of WebhooksFilters
 * Use this version if you want to add debouncing to search input
 * to reduce the number of filter operations during typing
 */

import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Search } from "lucide-react";
import { memo, useCallback, useState, useEffect } from "react";
import { useDebounce } from "@/lib/performance";

interface WebhooksFiltersProps {
    onSearchChange: (value: string) => void;
    onStatusChange: (value: string) => void;
    onEventTypeChange: (value: string) => void;
}

export const WebhooksFiltersDebounced = memo(({
    onSearchChange,
    onStatusChange,
    onEventTypeChange,
}: WebhooksFiltersProps) => {
    // Local state for immediate UI updates
    const [searchValue, setSearchValue] = useState("");
    
    // Debounced value for actual filtering (300ms delay)
    const debouncedSearch = useDebounce(searchValue, 300);

    // Update parent when debounced value changes
    useEffect(() => {
        onSearchChange(debouncedSearch);
    }, [debouncedSearch, onSearchChange]);

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchValue(e.target.value);
    }, []);

    const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        onStatusChange(e.target.value);
    }, [onStatusChange]);

    const handleEventTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        onEventTypeChange(e.target.value);
    }, [onEventTypeChange]);

    return (
        <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by Webhook ID or Payment ID..."
                    className="pl-10"
                    value={searchValue}
                    onChange={handleSearchChange}
                />
            </div>
            <div className="flex gap-4">
                <Select
                    className="w-[150px]"
                    onChange={handleStatusChange}
                >
                    <option value="all">All Statuses</option>
                    <option value="delivered">Delivered</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                </Select>
                <Select
                    className="w-[180px]"
                    onChange={handleEventTypeChange}
                >
                    <option value="all">All Event Types</option>
                    <option value="payment.success">payment.success</option>
                    <option value="payment.failed">payment.failed</option>
                    <option value="payout.completed">payout.completed</option>
                </Select>
                <Input
                    type="date"
                    className="w-[150px]"
                    title="Start Date"
                />
            </div>
        </div>
    );
});
WebhooksFiltersDebounced.displayName = "WebhooksFiltersDebounced";
