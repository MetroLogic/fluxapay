import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "../Sidebar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getAriaCurrentElements = () => {
    return screen.queryAllByRole("link", { current: "page" });
  };

  it("renders navigation items", () => {
    (usePathname as any).mockReturnValue("/dashboard");

    render(<Sidebar />);

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByText("Invoices")).toBeInTheDocument();
  });

  it("marks Overview as active for /dashboard", () => {
    (usePathname as any).mockReturnValue("/dashboard");

    render(<Sidebar />);

    const overviewLink = screen.getByText("Overview").closest("a");
    expect(overviewLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Payments as active for /dashboard/payments", () => {
    (usePathname as any).mockReturnValue("/dashboard/payments");

    render(<Sidebar />);

    const paymentsLink = screen.getByText("Payments").closest("a");
    expect(paymentsLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Payments as active for nested route /dashboard/payments/[id]", () => {
    (usePathname as any).mockReturnValue("/dashboard/payments/123");

    render(<Sidebar />);

    const paymentsLink = screen.getByText("Payments").closest("a");
    expect(paymentsLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Invoices as active for nested route /dashboard/invoices/[id]", () => {
    (usePathname as any).mockReturnValue("/dashboard/invoices/456");

    render(<Sidebar />);

    const invoicesLink = screen.getByText("Invoices").closest("a");
    expect(invoicesLink).toHaveAttribute("aria-current", "page");
  });

  it("does not mark similar-prefix route as active", () => {
    (usePathname as any).mockReturnValue("/dashboard/payments-custom");

    render(<Sidebar />);

    const paymentsLink = screen.getByText("Payments").closest("a");
    expect(paymentsLink).not.toHaveAttribute("aria-current", "page");
  });

  it("marks only one item as active per route", () => {
    (usePathname as any).mockReturnValue("/dashboard/payments/789");

    render(<Sidebar />);

    const activeLinks = getAriaCurrentElements();
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]).toHaveTextContent("Payments");
  });

  it("uses aria-label for semantic navigation", () => {
    (usePathname as any).mockReturnValue("/dashboard");

    const { container } = render(<Sidebar />);

    const nav = container.querySelector("nav");
    expect(nav).toHaveAttribute("aria-label", "Main navigation");
  });

  it("uses aria-current=page for active links (screen reader announcement)", () => {
    (usePathname as any).mockReturnValue("/dashboard/refunds");

    render(<Sidebar />);

    const refundsLink = screen.getByText("Refunds").closest("a");
    expect(refundsLink).toHaveAttribute("aria-current", "page");

    // Verify other links don't have aria-current
    const paymentsLink = screen.getByText("Payments").closest("a");
    expect(paymentsLink).not.toHaveAttribute("aria-current");
  });

  it("updates active state when pathname changes", () => {
    const { rerender } = render(<Sidebar />);

    (usePathname as any).mockReturnValue("/dashboard/payments");
    rerender(<Sidebar />);

    let paymentsLink = screen.getByText("Payments").closest("a");
    expect(paymentsLink).toHaveAttribute("aria-current", "page");

    (usePathname as any).mockReturnValue("/dashboard/invoices");
    rerender(<Sidebar />);

    paymentsLink = screen.getByText("Payments").closest("a");
    expect(paymentsLink).not.toHaveAttribute("aria-current", "page");

    const invoicesLink = screen.getByText("Invoices").closest("a");
    expect(invoicesLink).toHaveAttribute("aria-current", "page");
  });

  it("handles deeply nested routes", () => {
    (usePathname as any).mockReturnValue(
      "/dashboard/payments/detail/123/refund/456"
    );

    render(<Sidebar />);

    const paymentsLink = screen.getByText("Payments").closest("a");
    expect(paymentsLink).toHaveAttribute("aria-current", "page");
  });
});
