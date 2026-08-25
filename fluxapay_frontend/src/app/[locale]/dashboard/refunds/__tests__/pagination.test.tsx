/**
 * Server-side pagination for the refunds list (#780).
 *
 * The bug is a single unbounded query, so the assertions that matter are on
 * the *request*: that it carries page and limit, that paging changes the page
 * requested, and that the URL follows so a page can be linked to.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import RefundsPage, {
  parsePageParam,
} from "@/app/[locale]/dashboard/refunds/page";
import { api } from "@/lib/api";

const push = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => currentSearchParams,
  usePathname: () => "/dashboard/refunds",
  useParams: () => ({}),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  api: { refunds: { list: vi.fn() }, payments: { getById: vi.fn() } },
  toastApiError: vi.fn(),
}));

const listMock = vi.mocked(api.refunds.list);

/** Build `count` backend refunds, numbered from `startIndex`. */
function backendRefunds(count: number, startIndex = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `re_${startIndex + i}`,
    payment_id: `pay_${startIndex + i}`,
    merchant_id: "merch_1",
    amount: 100,
    currency: "USDC" as const,
    customer_address: "GABC",
    reason: "customer_request" as const,
    status: "completed" as const,
    created_at: "2026-01-01T00:00:00.000Z",
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearchParams = new URLSearchParams();
  listMock.mockResolvedValue({ refunds: backendRefunds(20), total: 142 });
});

describe("parsePageParam", () => {
  it.each([
    ["2", 2],
    ["1", 1],
    [null, 1],
    ["0", 1],
    ["-3", 1],
    ["abc", 1],
    ["1.5", 1],
  ])("parses %p as %p", (raw, expected) => {
    expect(parsePageParam(raw as string | null)).toBe(expected);
  });
});

describe("refunds pagination", () => {
  it("requests the first page with a bounded page size by default", async () => {
    render(<RefundsPage />);

    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it("no longer pulls the whole list in one query", async () => {
    render(<RefundsPage />);

    await waitFor(() => expect(listMock).toHaveBeenCalled());
    const params = listMock.mock.calls[0][0] as { limit?: number };
    expect(params.limit).toBe(20);
    expect(params.limit).not.toBe(100);
  });

  it("shows the total count alongside the visible range", async () => {
    render(<RefundsPage />);

    expect(await screen.findByText("Showing 1–20 of 142")).toBeInTheDocument();
  });

  it("reflects the page from the URL in the request and the range", async () => {
    currentSearchParams = new URLSearchParams("page=2");
    listMock.mockResolvedValue({ refunds: backendRefunds(20, 20), total: 142 });

    render(<RefundsPage />);

    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 20 }),
      ),
    );
    expect(await screen.findByText("Showing 21–40 of 142")).toBeInTheDocument();
  });

  it("pushes the next page into the URL for deep-linkability", async () => {
    render(<RefundsPage />);
    await screen.findByText("Showing 1–20 of 142");

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(push).toHaveBeenCalledWith("/dashboard/refunds?page=2");
  });

  it("drops the page param entirely when returning to page one", async () => {
    currentSearchParams = new URLSearchParams("page=2");
    listMock.mockResolvedValue({ refunds: backendRefunds(20, 20), total: 142 });

    render(<RefundsPage />);
    await screen.findByText("Showing 21–40 of 142");

    fireEvent.click(screen.getByRole("button", { name: /previous/i }));

    expect(push).toHaveBeenCalledWith("/dashboard/refunds");
  });

  it("keeps other query params when paging", async () => {
    currentSearchParams = new URLSearchParams("paymentId=pay_9");
    render(<RefundsPage />);
    await screen.findByText("Showing 1–20 of 142");

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(push).toHaveBeenCalledWith(
      "/dashboard/refunds?paymentId=pay_9&page=2",
    );
  });

  it("disables Previous on the first page and Next on the last", async () => {
    listMock.mockResolvedValue({ refunds: backendRefunds(5), total: 5 });

    render(<RefundsPage />);
    await screen.findByText("Showing 1–5 of 5");

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("filters by status server-side so the count matches the table", async () => {
    render(<RefundsPage />);
    await screen.findByText("Showing 1–20 of 142");

    listMock.mockResolvedValue({ refunds: backendRefunds(3), total: 3 });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "pending" },
    });

    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending", page: 1 }),
      ),
    );
  });

  it("returns to page one when the status filter changes", async () => {
    currentSearchParams = new URLSearchParams("page=3");
    listMock.mockResolvedValue({ refunds: backendRefunds(20, 40), total: 142 });

    render(<RefundsPage />);
    await screen.findByText("Showing 41–60 of 142");

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "failed" },
    });

    expect(push).toHaveBeenCalledWith("/dashboard/refunds");
  });

  it("falls back to a sensible count when the backend omits a total", async () => {
    currentSearchParams = new URLSearchParams("page=2");
    listMock.mockResolvedValue({ refunds: backendRefunds(7, 20) });

    render(<RefundsPage />);

    // 20 already seen on page one, plus the 7 on this page.
    expect(await screen.findByText("Showing 21–27 of 27")).toBeInTheDocument();
  });
});
