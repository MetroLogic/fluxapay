import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "../OfflineBanner";

let mockOnline = true;

vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => mockOnline,
}));

describe("OfflineBanner", () => {
  it("renders nothing when online", () => {
    mockOnline = true;
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders banner message when offline without throwing missing context", () => {
    mockOnline = false;
    render(<OfflineBanner />);
    expect(
      screen.getByText(/You are offline\. Showing cached data/i)
    ).toBeInTheDocument();
  });
});
