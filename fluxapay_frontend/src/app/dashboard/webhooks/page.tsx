"use client";

import { useState, useMemo } from "react";
import Header from "@/components/Header";
import { WebhooksFilters } from "@/features/webhooks/WebhooksFilters";
import { WebhooksTable } from "@/features/webhooks/WebhooksTable";
import { WebhookDetails } from "@/features/webhooks/WebhookDetails";
import { WebhookTest } from "@/features/webhooks/WebhookTest";
import { mockWebhooks, WebhookEvent } from "@/features/webhooks/webhooks-mock";
import { Button } from "@/components/Button";
import { Send } from "lucide-react";

export default function WebhooksPage() {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [eventTypeFilter, setEventTypeFilter] = useState("all");

    const [selectedWebhook, setSelectedWebhook] = useState<WebhookEvent | null>(
        null
    );
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);

    // Filter webhooks
    const filteredWebhooks = useMemo(() => {
        return mockWebhooks.filter((webhook) => {
            const matchSearch =
                search === "" ||
                webhook.id.toLowerCase().includes(search.toLowerCase()) ||
                webhook.paymentId.toLowerCase().includes(search.toLowerCase());

            const matchStatus =
                statusFilter === "all" || webhook.status === statusFilter;

            const matchEventType =
                eventTypeFilter === "all" || webhook.eventType === eventTypeFilter;

            return matchSearch && matchStatus && matchEventType;
        });
    }, [search, statusFilter, eventTypeFilter]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <Header
                    title="Webhooks"
                    description="Monitor and manage your webhook deliveries across all events."
                />
                <Button
                    variant="default"
                    className="gap-2 shrink-0"
                    onClick={() => setIsTestModalOpen(true)}
                >
                    <Send className="h-4 w-4" />
                    Test Webhook
                </Button>
            </div>

            <WebhooksFilters
                onSearchChange={setSearch}
                onStatusChange={setStatusFilter}
                onEventTypeChange={setEventTypeFilter}
            />

            <WebhooksTable
                webhooks={filteredWebhooks}
                onRowClick={(webhook) => setSelectedWebhook(webhook)}
            />

            <WebhookDetails
                webhook={selectedWebhook}
                isOpen={!!selectedWebhook}
                onClose={() => setSelectedWebhook(null)}
            />

            <WebhookTest
                isOpen={isTestModalOpen}
                onClose={() => setIsTestModalOpen(false)}
            />
        </div>
    );
}
