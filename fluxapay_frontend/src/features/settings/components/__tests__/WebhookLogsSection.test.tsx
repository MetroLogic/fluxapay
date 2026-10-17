import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";

const logs = vi.fn();
const logDetails = vi.fn();
const retry = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { webhooks: { logs: (...a: unknown[]) => logs(...a), logDetails: (...a: unknown[]) => logDetails(...a), retry: (...a: unknown[]) => retry(...a) } },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

import { WebhookLogsSection, WEBHOOK_LOGS_PAGE_SIZE } from "../WebhookLogsSection";
import {
  deliveryBadge,
  formatDuration,
  formatHttpStatus,
  formatJson,
  parseLogDetail,
  parseLogPage,
} from "../webhookLogs";

function logRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wh_1",
    event_type: "payment_confirmed",
    endpoint_url: "https://merchant.example/hooks",
    http_status: 200,
    status: "delivered",
    payment_id: "pay_1",
    retry_count: 0,
    created_at: "2026-10-15T12:00:00.000Z",
    updated_at: "2026-10-15T12:00:01.000Z",
    ...overrides,
  };
}

function page(rows: unknown[], pagination: Record<string, unknown>) {
  // fetchWithAuth returns the whole `{ message, data }` body.
  return { data: { message: "ok", data: { logs: rows, pagination } } };
}

describe("webhookLogs helpers", () => {
  it("maps backend statuses to badges", () => {
    expect(deliveryBadge("delivered")).toBe("success");
    expect(deliveryBadge("failed")).toBe("failed");
    expect(deliveryBadge("permanently_failed")).toBe("failed");
    expect(deliveryBadge("retrying")).toBe("retrying");
    expect(deliveryBadge("pending")).toBe("pending");
  });

  it("formats HTTP status, timeouts and duration", () => {
    expect(formatHttpStatus({ httpStatus: 500, status: "failed" })).toBe("500");
    expect(formatHttpStatus({ httpStatus: null, status: "failed" })).toBe("Timeout");
    expect(formatHttpStatus({ httpStatus: null, status: "pending" })).toBe("—");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(245)).toBe("245 ms");
    expect(formatDuration(1530)).toBe("1.53 s");
  });

  it("parses wrapped and unwrapped list responses", () => {
    const wrapped = parseLogPage(page([logRow()], { page: 2, total: 21, total_pages: 3 }).data, 2, 10);
    expect(wrapped).toMatchObject({ page: 2, total: 21, totalPages: 3 });
    expect(wrapped.rows[0]).toMatchObject({ id: "wh_1", eventType: "payment_confirmed", httpStatus: 200 });

    const bare = parseLogPage({ logs: [logRow({ duration_ms: 87 })] }, 1, 10);
    expect(bare.totalPages).toBe(1);
    expect(bare.rows[0].durationMs).toBe(87);
  });

  it("parses details and pretty-prints JSON", () => {
    const detail = parseLogDetail({
      data: {
        ...logRow({ status: "failed", http_status: 500 }),
        request_payload: { event: "payment.confirmed", data: { amount: "10" } },
        response_body: '{"error":"boom"}',
        retry_attempts: [{ attempt_number: 1, http_status: 500, error_message: "boom", timestamp: "2026-10-15T12:00:05Z" }],
      },
    });
    expect(detail.attempts).toHaveLength(1);
    expect(detail.requestHeaders).toBeNull();
    expect(formatJson(detail.requestPayload)).toContain('"event": "payment.confirmed"');
    expect(formatJson(detail.responseBody)).toBe('{\n  "error": "boom"\n}');
    expect(formatJson("not json")).toBe("not json");
  });
});

describe("WebhookLogsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists deliveries with status badges, HTTP codes and timeouts", async () => {
    logs.mockResolvedValue(
      page(
        [
          logRow(),
          logRow({ id: "wh_2", status: "failed", http_status: null }),
          logRow({ id: "wh_3", status: "retrying", http_status: 503 }),
        ],
        { page: 1, total: 3, total_pages: 1 },
      ),
    );

    render(<WebhookLogsSection />);

    expect(await screen.findByRole("heading", { name: "Webhook Logs" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId("webhook-status-badge")).toHaveLength(3));
    const badges = screen.getAllByTestId("webhook-status-badge").map((b) => b.textContent);
    expect(badges).toEqual(["Success", "Failed", "Retrying"]);
    expect(screen.getByText("Timeout")).toBeInTheDocument();
    expect(screen.getByText("503")).toBeInTheDocument();
    expect(logs).toHaveBeenCalledWith({ page: 1, limit: WEBHOOK_LOGS_PAGE_SIZE });
  });

  it("paginates through the delivery history", async () => {
    logs.mockImplementation(async ({ page: p }: { page: number }) =>
      page([logRow({ id: `wh_p${p}`, event_type: `event_page_${p}` })], { page: p, total: 15, total_pages: 2 }),
    );

    render(<WebhookLogsSection />);
    expect(await screen.findByText("event_page_1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("event_page_2")).toBeInTheDocument();
    expect(logs).toHaveBeenLastCalledWith({ page: 2, limit: WEBHOOK_LOGS_PAGE_SIZE });
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("opens the detail modal and resends the webhook with a success toast", async () => {
    logs.mockResolvedValue(page([logRow({ status: "failed", http_status: 500 })], { page: 1, total: 1, total_pages: 1 }));
    logDetails.mockResolvedValue({
      data: {
        data: {
          ...logRow({ status: "failed", http_status: 500 }),
          request_payload: { event: "payment.confirmed", payment_id: "pay_1" },
          response_body: '{"error":"internal"}',
          retry_attempts: [],
        },
      },
    });
    retry.mockResolvedValue({ data: { message: "Webhook retry queued" } });

    render(<WebhookLogsSection />);
    fireEvent.click(await screen.findByRole("button", { name: /view delivery payment_confirmed/i }));

    const dialog = await screen.findByTestId("webhook-log-detail");
    expect(logDetails).toHaveBeenCalledWith("wh_1");
    expect(await within(dialog).findByLabelText("Request payload")).toHaveTextContent('"payment_id": "pay_1"');
    expect(within(dialog).getByLabelText("Response body")).toHaveTextContent('"error": "internal"');
    expect(within(dialog).getByText("X-FluxaPay-Signature")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /resend webhook/i }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith("wh_1"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    // The list refreshes after a resend.
    await waitFor(() => expect(logs).toHaveBeenCalledTimes(2));
  });

  it("shows an error toast when the resend fails", async () => {
    logs.mockResolvedValue(page([logRow()], { page: 1, total: 1, total_pages: 1 }));
    logDetails.mockResolvedValue({ data: { data: logRow() } });
    retry.mockResolvedValue({ error: { message: "Max retries reached" } });

    render(<WebhookLogsSection />);
    fireEvent.click(await screen.findByRole("button", { name: /view delivery/i }));
    fireEvent.click(await screen.findByRole("button", { name: /resend webhook/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Max retries reached"));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("shows an empty state and a load error", async () => {
    logs.mockResolvedValueOnce(page([], { page: 1, total: 0, total_pages: 0 }));
    const { unmount } = render(<WebhookLogsSection />);
    expect(await screen.findByText(/no webhook deliveries yet/i)).toBeInTheDocument();
    unmount();

    logs.mockResolvedValueOnce({ error: { message: "Service unavailable" } });
    render(<WebhookLogsSection />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
  });
});
