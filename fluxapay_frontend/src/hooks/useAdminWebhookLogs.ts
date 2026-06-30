"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

export interface AdminWebhookLog {
  id: string;
  merchant_id: string;
  merchant_name?: string;
  merchant_email?: string;
  event_type: string;
  endpoint_url: string;
  http_status: number | null;
  status: "pending" | "delivered" | "failed" | "retrying";
  event_id: string;
  payment_id: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

interface AdminWebhookLogsResponse {
  message?: string;
  data: {
    logs: AdminWebhookLog[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  };
}

interface UseAdminWebhookLogsParams {
  merchant_id?: string;
  event_type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useAdminWebhookLogs(params: UseAdminWebhookLogsParams = {}) {
  const key = ["admin-webhook-logs", params];

  const { data, error, isLoading, mutate } = useSWR<AdminWebhookLogsResponse>(
    key,
    async () => {
      try {
        return (await api.admin.webhooks.logs(params)) as AdminWebhookLogsResponse;
      } catch (err) {
        console.error("Failed to fetch admin webhook logs", err);
        return {
          data: {
            logs: [],
            pagination: { total: 0, page: params.page || 1, limit: params.limit || 10, total_pages: 0 },
          },
        };
      }
    }
  );

  return {
    logs: data?.data?.logs ?? [],
    pagination: data?.data?.pagination,
    error: error ?? null,
    isLoading,
    mutate,
  };
}
