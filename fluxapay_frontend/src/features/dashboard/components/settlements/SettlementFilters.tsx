'use client';

type Props = {
    status: string;
    currency: string;
    date: { from: string; to: string };
    onStatusChange: (value: string) => void;
    onCurrencyChange: (value: string) => void;
    onDateChange: (value: { from: string; to: string }) => void;
};

export function SettlementFilters({
    status,
    currency,
    date,
    onStatusChange,
    onCurrencyChange,
    onDateChange,
}: Props) {
    return (
        <div className="rounded-xl border bg-card p-4 shadow">
            <div className="grid gap-4 md:grid-cols-4">
                {/* Status */}
                <div>
                    <label className="text-sm font-medium mb-1.5 block">Status</label>
                    <select
                        value={status}
                        onChange={(e) => onStatusChange(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                        <option value="all">All Statuses</option>
                        <option value="completed">Completed</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>

                {/* Currency */}
                <div>
                    <label className="text-sm font-medium mb-1.5 block">Currency</label>
                    <select
                        value={currency}
                        onChange={(e) => onCurrencyChange(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                        <option value="all">All Currencies</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                    </select>
                </div>

                {/* From */}
                <div>
                    <label className="text-sm font-medium mb-1.5 block">From Date</label>
                    <input
                        type="date"
                        value={date.from}
                        onChange={(e) =>
                            onDateChange({ ...date, from: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>

                {/* To */}
                <div>
                    <label className="text-sm font-medium mb-1.5 block">To Date</label>
                    <input
                        type="date"
                        value={date.to}
                        onChange={(e) =>
                            onDateChange({ ...date, to: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
            </div>
        </div>
    );
}
