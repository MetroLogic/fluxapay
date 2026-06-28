"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { WebhooksFilters } from "@/features/webhooks/WebhooksFilters";
import { WebhooksTable } from "@/features/webhooks/WebhooksTable";
import { WebhookDetails } from "@/features/webhooks/WebhookDetails";
import { WebhookTest } from "@/features/webhooks/WebhookTest";
import { Button } from "@/components/Button";
import { Send } from "lucide-react";
import { toastApiError } from "@/lib/toastApiError";
import { api, type MerchantExportFormat } from "@/lib/api";
import { WebhookEvent } from "@/features/webhooks/types";
import { DataTableCard, TablePaginationBar } from "@/components/data-table";
import { ExportActionButtons } from "@/components/data-table/ExportActionButtons";
import { useMerchantDataExport } from "@/hooks/useMerchantDataExport";

export default function WebhooksPage() {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [eventTypeFilter, setEventTypeFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);
    const pageSize = 50;
    const { exportData, exportingFormat } = useMerchantDataExport();

    const [selectedWebhook, setSelectedWebhook] = useState<WebhookEvent | null>(
        null
    );
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setLoadError(null);
            try {
                const date_from = dateFrom ? new Date(dateFrom).toISOString() : undefined;
                const date_to = dateTo ? new Date(dateTo).toISOString() : undefined;

                const res = await api.webhooks.logs({
                    search,
                    status: statusFilter,
                    event_type: eventTypeFilter,
                    date_from,
                    date_to,
                    page,
                    limit: pageSize,
                });

                if (cancelled) return;

                const logs = res?.data?.logs ?? [];
                const pag = res?.data?.pagination as { total?: number } | undefined;
                setTotal(typeof pag?.total === "number" ? pag.total : logs.length);
                const mapped: WebhookEvent[] = logs.map(
                  (log: Record<string, unknown>) => ({
                    id: String(log.id),
                    paymentId: String(log.payment_id ?? ""),
                    eventType: String(log.event_type),
                    status: log.status,
                    endpoint: String(log.endpoint_url),
                    attempts: Number(log.retry_count ?? 0) + 1,
                    lastAttempt: String(log.updated_at ?? log.created_at),
                    createdAt: String(log.created_at),
                    payload: {},
                    response: { status: Number(log.http_status ?? 0) },
                    retryHistory: [],
                  }),
                );

                setWebhooks(mapped);
            } catch (e) {
                if (!cancelled) {
                    setLoadError("Failed to load webhook logs.");
                    toastApiError(e);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [search, statusFilter, eventTypeFilter, dateFrom, dateTo, page, refreshKey]);

    useEffect(() => {
        setPage(1);
    }, [search, statusFilter, eventTypeFilter, dateFrom, dateTo]);

    const filteredWebhooks = webhooks;
    const handleExport = (format: MerchantExportFormat) => {
        const date_from = dateFrom ? new Date(dateFrom).toISOString() : undefined;
        const date_to = dateTo ? new Date(dateTo).toISOString() : undefined;

        exportData({
            resource: "webhooks",
            format,
            filters: {
                search: search || undefined,
                status: statusFilter,
                event_type: eventTypeFilter,
                date_from,
                date_to,
            },
            page,
            limit: pageSize,
        });
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <Header
                    title="Webhooks"
                    description="Monitor and manage your webhook deliveries across all events."
                />
                <div className="flex flex-wrap items-center gap-2">
                    <ExportActionButtons onExport={handleExport} exportingFormat={exportingFormat} />
                    <Button
                        variant="default"
                        className="gap-2 shrink-0"
                        onClick={() => setIsTestModalOpen(true)}
                    >
                        <Send className="h-4 w-4" />
                        Test Webhook
                    </Button>
                </div>
            </div>

            <DataTableCard
                toolbar={
                    <WebhooksFilters
                        onSearchChange={setSearch}
                        onStatusChange={setStatusFilter}
                        onEventTypeChange={setEventTypeFilter}
                        onDateFromChange={setDateFrom}
                        onDateToChange={setDateTo}
                    />
                }
                footer={
                    <TablePaginationBar
                        page={page}
                        pageSize={pageSize}
                        total={total}
                        loading={loading}
                        onPageChange={setPage}
                    />
                }
            >
                <WebhooksTable
                    webhooks={filteredWebhooks}
                    onRowClick={(webhook) => setSelectedWebhook(webhook)}
                    loading={loading}
                    error={loadError}
                />
            </DataTableCard>

            <WebhookDetails
                webhook={selectedWebhook}
                isOpen={!!selectedWebhook}
                onClose={() => setSelectedWebhook(null)}
                onRetried={() => setRefreshKey((k) => k + 1)}
            />

            <WebhookTest
                isOpen={isTestModalOpen}
                onClose={() => setIsTestModalOpen(false)}
            />
        </div>
    );
}
