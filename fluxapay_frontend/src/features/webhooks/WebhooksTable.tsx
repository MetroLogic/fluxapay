import { Badge } from "@/components/Badge";
import { WebhookEvent, WebhookStatus } from "./webhooks-mock";
import { ChevronDown, ChevronUp, Copy, Eye } from "lucide-react";
import { useState } from "react";

interface WebhooksTableProps {
    webhooks: WebhookEvent[];
    onRowClick: (webhook: WebhookEvent) => void;
}

interface SortIconProps {
    column: keyof WebhookEvent;
    sortConfig: {
        key: keyof WebhookEvent;
        direction: "asc" | "desc";
    } | null;
}

const SortIcon = ({ column, sortConfig }: SortIconProps) => {
    if (sortConfig?.key !== column)
        return <ChevronDown className="h-4 w-4 opacity-30" />;
    return sortConfig.direction === "asc" ? (
        <ChevronUp className="h-4 w-4" />
    ) : (
        <ChevronDown className="h-4 w-4" />
    );
};

export const WebhooksTable = ({ webhooks, onRowClick }: WebhooksTableProps) => {
    const [sortConfig, setSortConfig] = useState<{
        key: keyof WebhookEvent;
        direction: "asc" | "desc";
    } | null>({ key: "createdAt", direction: "desc" });

    const handleSort = (key: keyof WebhookEvent) => {
        let direction: "asc" | "desc" = "asc";
        if (
            sortConfig &&
            sortConfig.key === key &&
            sortConfig.direction === "asc"
        ) {
            direction = "desc";
        }
        setSortConfig({ key, direction });
    };

    const sortedWebhooks = [...webhooks].sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;

        // Special handling for nested properties or specific types can go here
        if (a[key]! < b[key]!) return direction === "asc" ? -1 : 1;
        if (a[key]! > b[key]!) return direction === "asc" ? 1 : -1;
        return 0;
    });

    const getStatusBadge = (status: WebhookStatus) => {
        switch (status) {
            case "delivered":
                return <Badge variant="success">Delivered</Badge>;
            case "pending":
                return <Badge variant="warning">Pending</Badge>;
            case "failed":
                return <Badge variant="error">Failed</Badge>;
            default:
                return <Badge>{status}</Badge>;
        }
    };

    return (
        <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b bg-muted/50 transition-colors">
                            <th
                                className="px-4 py-3 font-medium cursor-pointer"
                                onClick={() => handleSort("id")}
                            >
                                <div className="flex items-center gap-1">
                                    Webhook ID <SortIcon column="id" sortConfig={sortConfig} />
                                </div>
                            </th>
                            <th
                                className="px-4 py-3 font-medium cursor-pointer"
                                onClick={() => handleSort("eventType")}
                            >
                                <div className="flex items-center gap-1">
                                    Event Type <SortIcon column="eventType" sortConfig={sortConfig} />
                                </div>
                            </th>
                            <th
                                className="px-4 py-3 font-medium cursor-pointer"
                                onClick={() => handleSort("status")}
                            >
                                <div className="flex items-center gap-1">
                                    Status <SortIcon column="status" sortConfig={sortConfig} />
                                </div>
                            </th>
                            <th className="px-4 py-3 font-medium">Endpoint</th>
                            <th className="px-4 py-3 font-medium text-center">Attempts</th>
                            <th
                                className="px-4 py-3 font-medium cursor-pointer text-right"
                                onClick={() => handleSort("createdAt")}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    Created <SortIcon column="createdAt" sortConfig={sortConfig} />
                                </div>
                            </th>
                            <th className="px-4 py-3 font-medium text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {sortedWebhooks.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={7}
                                    className="px-4 py-12 text-center text-muted-foreground"
                                >
                                    No webhooks found matching your filters.
                                </td>
                            </tr>
                        ) : (
                            sortedWebhooks.map((webhook) => (
                                <tr
                                    key={webhook.id}
                                    className="group hover:bg-muted/50 cursor-pointer transition-colors"
                                    onClick={() => onRowClick(webhook)}
                                >
                                    <td className="px-4 py-4 font-mono text-xs max-w-[120px] truncate" title={webhook.id}>
                                        {webhook.id}
                                    </td>
                                    <td className="px-4 py-4 font-medium">
                                        {webhook.eventType}
                                    </td>
                                    <td className="px-4 py-4">
                                        {getStatusBadge(webhook.status)}
                                    </td>
                                    <td className="px-4 py-4 max-w-[200px] truncate text-muted-foreground" title={webhook.endpoint}>
                                        {webhook.endpoint}
                                    </td>
                                    <td className="px-4 py-4 text-center tabular-nums">
                                        {webhook.attempts}
                                    </td>
                                    <td className="px-4 py-4 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                        {new Date(webhook.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                className="p-1 hover:bg-muted rounded"
                                                title="View Details"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRowClick(webhook);
                                                }}
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                            <button
                                                className="p-1 hover:bg-muted rounded text-primary"
                                                title="Copy ID"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigator.clipboard.writeText(webhook.id);
                                                }}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
