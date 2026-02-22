import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Search } from "lucide-react";

interface WebhooksFiltersProps {
    onSearchChange: (value: string) => void;
    onStatusChange: (value: string) => void;
    onEventTypeChange: (value: string) => void;
}

export const WebhooksFilters = ({
    onSearchChange,
    onStatusChange,
    onEventTypeChange,
}: WebhooksFiltersProps) => {
    return (
        <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by Webhook ID or Payment ID..."
                    className="pl-10"
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>
            <div className="flex gap-4">
                <Select
                    className="w-[150px]"
                    onChange={(e) => onStatusChange(e.target.value)}
                >
                    <option value="all">All Statuses</option>
                    <option value="delivered">Delivered</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                </Select>
                <Select
                    className="w-[180px]"
                    onChange={(e) => onEventTypeChange(e.target.value)}
                >
                    <option value="all">All Event Types</option>
                    <option value="payment.success">payment.success</option>
                    <option value="payment.failed">payment.failed</option>
                    <option value="payout.completed">payout.completed</option>
                </Select>
                {/* Simplified Date Range filter as a placeholder, could use a proper Date Picker component if available */}
                <Input
                    type="date"
                    className="w-[150px]"
                    title="Start Date"
                />
            </div>
        </div>
    );
};
