import { ListPageFilterBar } from "@/components/data-table";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Search } from "lucide-react";
import { memo, useCallback, useState, useEffect } from "react";
import { useDebounce } from "@/lib/performance";

interface WebhooksFiltersProps {
    onSearchChange: (value: string) => void;
    onStatusChange: (value: string) => void;
    onEventTypeChange: (value: string) => void;
    onDateFromChange: (value: string) => void;
    onDateToChange: (value: string) => void;
}

export const WebhooksFilters = memo(({
    onSearchChange,
    onStatusChange,
    onEventTypeChange,
    onDateFromChange,
    onDateToChange,
}: WebhooksFiltersProps) => {
    const [searchValue, setSearchValue] = useState("");
    const debouncedSearch = useDebounce(searchValue, 300);

    useEffect(() => {
        onSearchChange(debouncedSearch);
    }, [debouncedSearch, onSearchChange]);

    const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        onStatusChange(e.target.value);
    }, [onStatusChange]);

    const handleEventTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        onEventTypeChange(e.target.value);
    }, [onEventTypeChange]);

    const handleDateFromChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onDateFromChange(e.target.value);
    }, [onDateFromChange]);

    const handleDateToChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onDateToChange(e.target.value);
    }, [onDateToChange]);

    return (
        <ListPageFilterBar>
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by Webhook ID or Payment ID..."
                    className="pl-10"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                />
            </div>
            <div className="flex gap-4">
                <Select className="w-[150px]" onChange={handleStatusChange}>
                    <option value="all">All Statuses</option>
                    <option value="delivered">Delivered</option>
                    <option value="pending">Pending</option>
                    <option value="retrying">Retrying</option>
                    <option value="failed">Failed</option>
                </Select>
                <Select className="w-[200px]" onChange={handleEventTypeChange}>
                    <option value="all">All Event Types</option>
                    <option value="payment_completed">payment_completed</option>
                    <option value="payment_confirmed">payment_confirmed</option>
                    <option value="payment_failed">payment_failed</option>
                    <option value="payment_pending">payment_pending</option>
                    <option value="payment_expired">payment_expired</option>
                    <option value="payment_partially_paid">payment_partially_paid</option>
                    <option value="payment_overpaid">payment_overpaid</option>
                    <option value="refund_completed">refund_completed</option>
                    <option value="refund_failed">refund_failed</option>
                    <option value="settlement_completed">settlement_completed</option>
                    <option value="settlement_failed">settlement_failed</option>
                    <option value="subscription_created">subscription_created</option>
                    <option value="subscription_cancelled">subscription_cancelled</option>
                    <option value="subscription_renewed">subscription_renewed</option>
                </Select>
                <Input
                    type="date"
                    className="w-[150px]"
                    title="Start Date"
                    onChange={handleDateFromChange}
                />
                <Input
                    type="date"
                    className="w-[150px]"
                    title="End Date"
                    onChange={handleDateToChange}
                />
            </div>
        </ListPageFilterBar>
    );
});
WebhooksFilters.displayName = "WebhooksFilters";
