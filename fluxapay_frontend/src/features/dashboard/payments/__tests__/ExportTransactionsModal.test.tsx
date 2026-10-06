import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { downloadTransactionsCsv } = vi.hoisted(() => ({
  downloadTransactionsCsv: vi.fn(),
}));

vi.mock("@/services/transactionCsvExport.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/transactionCsvExport.service")>();
  return { ...actual, downloadTransactionsCsv };
});

vi.mock("react-hot-toast", () => {
  const toast = vi.fn();
  return {
    default: Object.assign(toast, {
      loading: vi.fn(() => "toast-1"),
      success: vi.fn(),
      error: vi.fn(),
      dismiss: vi.fn(),
    }),
  };
});

import { ExportTransactionsModal } from "../ExportTransactionsModal";

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
};

beforeEach(() => {
  downloadTransactionsCsv.mockReset();
  downloadTransactionsCsv.mockResolvedValue({
    blob: new Blob([]),
    filename: "transactions_2026-03-15.csv",
    rowCount: 42,
    truncated: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ExportTransactionsModal", () => {
  it("renders nothing while closed", () => {
    render(<ExportTransactionsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens with a date range picker and a range summary", () => {
    render(<ExportTransactionsModal {...defaultProps} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Export start date")).toBeInTheDocument();
    expect(screen.getByLabelText("Export end date")).toBeInTheDocument();
    expect(screen.getByTestId("export-date-range-summary")).toHaveTextContent(
      "All time",
    );
  });

  it("seeds the picker from the filters currently applied to the table", () => {
    render(
      <ExportTransactionsModal
        {...defaultProps}
        initialFilters={{ dateFrom: "2026-03-01", dateTo: "2026-03-31", status: "completed" }}
      />,
    );

    expect(screen.getByLabelText("Export start date")).toHaveValue("2026-03-01");
    expect(screen.getByLabelText("Export end date")).toHaveValue("2026-03-31");
    expect(screen.getByLabelText("Status")).toHaveValue("completed");
    expect(screen.getByTestId("export-date-range-summary")).toHaveTextContent(
      "2026-03-01 to 2026-03-31",
    );
  });

  it("applies a date range preset to both inputs", async () => {
    const user = userEvent.setup();
    render(<ExportTransactionsModal {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText("Date range"), "7d");

    const start = screen.getByLabelText("Export start date") as HTMLInputElement;
    const end = screen.getByLabelText("Export end date") as HTMLInputElement;
    expect(start.value).not.toBe("");
    expect(end.value).not.toBe("");
    expect(new Date(end.value).getTime()).toBeGreaterThanOrEqual(
      new Date(start.value).getTime(),
    );
  });

  it("exports the selected date range and closes on success", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ExportTransactionsModal
        {...defaultProps}
        onClose={onClose}
        initialFilters={{ dateFrom: "2026-03-01", dateTo: "2026-03-31" }}
      />,
    );

    await user.click(screen.getByTestId("confirm-export-csv"));

    await waitFor(() => expect(downloadTransactionsCsv).toHaveBeenCalledTimes(1));
    expect(downloadTransactionsCsv.mock.calls[0][0]).toMatchObject({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("blocks the export and explains an inverted range", async () => {
    render(<ExportTransactionsModal {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Export start date"), {
      target: { value: "2026-03-31" },
    });
    fireEvent.change(screen.getByLabelText("Export end date"), {
      target: { value: "2026-03-01" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("export-date-range-summary")).toHaveTextContent(
        "Start date must be on or before the end date.",
      ),
    );
    expect(screen.getByTestId("confirm-export-csv")).toBeDisabled();
    expect(downloadTransactionsCsv).not.toHaveBeenCalled();
  });

  it("switches the preset to Custom once a date is typed", async () => {
    render(<ExportTransactionsModal {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Export start date"), {
      target: { value: "2026-03-01" },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Date range")).toHaveValue("custom"),
    );
  });
});
