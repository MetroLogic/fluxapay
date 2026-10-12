import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import toast from "react-hot-toast";
import { CopyButton } from "../CopyButton";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// Deliberately not credential-shaped. FluxaPay issues keys as `sk_live_<hex>`,
// which GitHub push protection flags as a Stripe key even when the value is
// fabricated — so a "realistic" fixture here gets the branch rejected. This
// component treats the value as an opaque string, so realism buys nothing.
const SECRET = "fluxapay-copy-button-test-value";

describe("CopyButton", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  });

  // fireEvent rather than userEvent: userEvent.setup() installs its own
  // navigator.clipboard stub, which would shadow the spy we assert on.
  const clickCopy = (name = "Copy API key") =>
    fireEvent.click(screen.getByLabelText(name));

  it("copies the value to the clipboard on click", async () => {
    render(<CopyButton value={SECRET} label="API key" />);

    clickCopy();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(toast.success).toHaveBeenCalledWith("API key copied to clipboard");
  });

  it("uses a custom aria-label when provided", () => {
    render(<CopyButton value={SECRET} label="API key" ariaLabel="Copy secret key" />);

    expect(screen.getByLabelText("Copy secret key")).toBeInTheDocument();
  });

  it("announces the copy in a live region for screen readers", async () => {
    const { container } = render(<CopyButton value={SECRET} label="API key" />);
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toBe("");

    clickCopy();

    await waitFor(() => {
      expect(status?.textContent).toBe("API key copied to clipboard");
    });
  });

  it("swaps the visible caption to the copied state", async () => {
    render(<CopyButton value={SECRET} label="API key" text="Copy" />);

    expect(screen.getByText("Copy")).toBeInTheDocument();

    clickCopy();

    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });

  // Issue #1206: clipboard writes reject in insecure contexts, and an unhandled
  // rejection would leave the button silently doing nothing.
  it("reports a failure instead of failing silently", async () => {
    writeText.mockRejectedValueOnce(new Error("clipboard blocked"));
    render(<CopyButton value={SECRET} label="API key" />);

    clickCopy();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to copy to clipboard");
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("explains why it cannot copy instead of copying a masked value", async () => {
    const disabledMessage = "Rotate your API key to get a new secret you can copy.";
    render(
      <CopyButton
        value=""
        label="API key"
        disabled
        disabledMessage={disabledMessage}
      />,
    );

    clickCopy();

    // Never put a masked/placeholder value on the clipboard.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(disabledMessage));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("guards against copying an empty value", async () => {
    render(<CopyButton value="" label="API key" />);

    clickCopy();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("No API key to copy yet");
    });
    expect(writeText).not.toHaveBeenCalled();
  });
});
