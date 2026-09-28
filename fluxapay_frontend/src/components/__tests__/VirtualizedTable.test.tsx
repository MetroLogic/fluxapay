import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";
import { VirtualizedTable } from "@/components/VirtualizedTable";

expect.extend(toHaveNoViolations);

interface Row {
  id: string;
  label: string;
}

const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({
  id: `row-${i}`,
  label: `Row ${i}`,
}));

const renderRow = (item: Row) => <span>{item.label}</span>;

describe("VirtualizedTable", () => {
  describe("empty data", () => {
    it("renders the empty state instead of crashing on an empty array", () => {
      expect(() =>
        render(
          <VirtualizedTable
            data={[]}
            rowHeight={40}
            containerHeight={400}
            renderRow={renderRow}
          />,
        ),
      ).not.toThrow();

      expect(screen.getByText("No data available.")).toBeInTheDocument();
    });

    it("does not crash when data is undefined", () => {
      expect(() =>
        render(
          <VirtualizedTable
            rowHeight={40}
            containerHeight={400}
            renderRow={renderRow}
          />,
        ),
      ).not.toThrow();

      expect(screen.getByText("No data available.")).toBeInTheDocument();
    });

    it("does not crash when data is null", () => {
      expect(() =>
        render(
          <VirtualizedTable
            data={null}
            rowHeight={40}
            containerHeight={400}
            renderRow={renderRow}
          />,
        ),
      ).not.toThrow();
    });

    it("never calls renderRow when there are no rows", () => {
      const spy = vi.fn(renderRow);
      render(
        <VirtualizedTable
          data={[]}
          rowHeight={40}
          containerHeight={400}
          renderRow={spy}
        />,
      );

      expect(spy).not.toHaveBeenCalled();
    });

    it("uses a custom empty message when given one", () => {
      render(
        <VirtualizedTable
          data={[]}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderRow}
          emptyMessage="No payments yet."
        />,
      );

      expect(screen.getByText("No payments yet.")).toBeInTheDocument();
    });

    it("renders a custom empty icon above the message", () => {
      render(
        <VirtualizedTable
          data={[]}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderRow}
          emptyMessage="Nothing here"
          emptyIcon={<span data-testid="empty-icon">icon</span>}
        />,
      );

      expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
      expect(screen.getByText("Nothing here")).toBeInTheDocument();
    });

    it("still renders the header when there are no rows", () => {
      render(
        <VirtualizedTable
          data={[]}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderRow}
          renderHeader={() => <div>Header row</div>}
        />,
      );

      expect(screen.getByText("Header row")).toBeInTheDocument();
    });

    it("does not nest a <tr> outside a table", () => {
      const { container } = render(
        <VirtualizedTable
          data={[]}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderRow}
        />,
      );

      // EmptyState's default variant emits <tr><td>, which would be invalid
      // DOM here — the block variant must be used instead.
      expect(container.querySelector("tr")).toBeNull();
    });
  });

  describe("non-empty data", () => {
    it("renders rows from the top of the list", () => {
      render(
        <VirtualizedTable
          data={rows}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderRow}
        />,
      );

      expect(screen.getByText("Row 0")).toBeInTheDocument();
      expect(screen.queryByText("No data available.")).not.toBeInTheDocument();
    });

    it("virtualizes: far-off rows are not rendered", () => {
      render(
        <VirtualizedTable
          data={rows}
          rowHeight={40}
          containerHeight={200}
          renderRow={renderRow}
          overscan={1}
        />,
      );

      expect(screen.getByText("Row 0")).toBeInTheDocument();
      expect(screen.queryByText("Row 24")).not.toBeInTheDocument();
    });

    it("renders a single row without issue", () => {
      render(
        <VirtualizedTable
          data={[rows[0]]}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderRow}
        />,
      );

      expect(screen.getByText("Row 0")).toBeInTheDocument();
    });

    it("renders the header alongside rows", () => {
      render(
        <VirtualizedTable
          data={rows}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderRow}
          renderHeader={() => <div>Header row</div>}
        />,
      );

      expect(screen.getByText("Header row")).toBeInTheDocument();
      expect(screen.getByText("Row 0")).toBeInTheDocument();
    });

    it("passes the absolute index to renderRow", () => {
      const spy = vi.fn((item: Row, index: number) => (
        <span>{`${index}:${item.label}`}</span>
      ));
      render(
        <VirtualizedTable
          data={rows.slice(0, 3)}
          rowHeight={40}
          containerHeight={400}
          renderRow={spy}
        />,
      );

      expect(screen.getByText("0:Row 0")).toBeInTheDocument();
      expect(screen.getByText("2:Row 2")).toBeInTheDocument();
    });
  });

  describe("accessibility (screen-reader row count)", () => {
    const renderTr = (item: Row, index: number) => (
      <tr key={item.id}>
        <td>{`${index}:${item.label}`}</td>
      </tr>
    );

    it("sets role=grid and aria-rowcount to the full dataset size", () => {
      const { container } = render(
        <VirtualizedTable
          data={rows}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderTr}
          renderHeader={() => (
            <tr>
              <th>Label</th>
            </tr>
          )}
        />,
      );

      const grid = container.querySelector('[role="grid"]');
      expect(grid).not.toBeNull();
      expect(grid?.getAttribute("aria-rowcount")).toBe(String(rows.length));
    });

    it("sets aria-rowindex on each rendered row to its 1-based absolute position", () => {
      const { container } = render(
        <VirtualizedTable
          data={rows.slice(0, 3)}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderTr}
        />,
      );

      const trs = Array.from(container.querySelectorAll("tbody tr"));
      expect(trs.map((tr) => tr.getAttribute("aria-rowindex"))).toEqual([
        "1",
        "2",
        "3",
      ]);
    });

    it("has no axe-core ARIA violations", async () => {
      const { container } = render(
        <VirtualizedTable
          data={rows.slice(0, 5)}
          rowHeight={40}
          containerHeight={400}
          renderRow={renderTr}
          renderHeader={() => (
            <tr>
              <th>Label</th>
            </tr>
          )}
          ariaLabel="Payments"
        />,
      );

      const violations = await axe(container);
      expect(violations).toHaveNoViolations();
    });
  });
});
