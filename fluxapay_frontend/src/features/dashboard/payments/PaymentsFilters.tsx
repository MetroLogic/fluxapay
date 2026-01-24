import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Search } from "lucide-react";

interface PaymentsFiltersProps {
    onSearchChange: (value: string) => void;
    onStatusChange: (value: string) => void;
    onCurrencyChange: (value: string) => void;
}

export const PaymentsFilters = ({
    onSearchChange,
    onStatusChange,
    onCurrencyChange,
}: PaymentsFiltersProps) => {
    return (
        <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by ID, Order ID, or customer..."
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
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="expired">Expired</option>
                    <option value="failed">Failed</option>
                </Select>
                <Select
                    className="w-[120px]"
                    onChange={(e) => onCurrencyChange(e.target.value)}
                >
                    <option value="all">All Currencies</option>
                    <option value="USDC">USDC</option>
                    <option value="XLM">XLM</option>
                    <option value="EURC">EURC</option>
                </Select>
            </div>
        </div>
    );
};
