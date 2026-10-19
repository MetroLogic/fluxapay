import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createKey, listApiKeys } = vi.hoisted(() => ({
  createKey: vi.fn(),
  listApiKeys: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { keys: { createKey, listApiKeys, regenerate: vi.fn() } },
}));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import { ApiKeysTab } from "../ApiKeysTab";

describe("ApiKeysTab scoped key management", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows permissions on existing keys", async () => {
    listApiKeys.mockResolvedValue({
      data: {
        data: [{
          id: "key_1",
          name: "Production reporting",
          last_four: "abcd",
          environment: "live",
          status: "active",
          created_at: "2026-10-19T00:00:00.000Z",
          permissions: ["payments:read", "refunds:read"],
          ip_allowlist: ["192.0.2.0/24"],
        }],
      },
    });

    render(<ApiKeysTab initialApiKey="legacy-secret" />);

    expect(await screen.findByText("Production reporting")).toBeInTheDocument();
    expect(screen.getByText("payments:read")).toBeInTheDocument();
    expect(screen.getByText("refunds:read")).toBeInTheDocument();
    expect(screen.getByText("192.0.2.0/24")).toBeInTheDocument();
  });

  it("validates CIDRs, creates a scoped key, and reveals its secret once", async () => {
    const user = userEvent.setup();
    listApiKeys.mockResolvedValue({ data: { data: [] } });
    createKey.mockResolvedValue({
      data: {
        id: "key_2",
        name: "Worker",
        key: "fpk_test_one_time_secret",
        environment: "test",
        permissions: ["payments:read"],
        ip_allowlist: ["192.0.2.0/24"],
      },
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ApiKeysTab initialApiKey="legacy-secret" />);
    await user.click(screen.getByRole("button", { name: "Create API Key" }));
    const createDialog = screen.getByRole("dialog", { name: "Create scoped API key" });
    await user.type(within(createDialog).getByLabelText("Key name"), "Worker");
    await user.click(within(createDialog).getByRole("radio", { name: "Full access" }));
    expect(within(createDialog).getByRole("checkbox", { name: /Manage webhooks/ })).toBeChecked();

    const allowlist = within(createDialog).getByLabelText("IP allowlist (optional)");
    fireEvent.change(allowlist, { target: { value: "invalid/45" } });
    expect(within(createDialog).getByRole("alert")).toHaveTextContent("valid IPv4 or IPv6");
    expect(within(createDialog).getByRole("button", { name: "Create API Key" })).toBeDisabled();

    fireEvent.change(allowlist, { target: { value: "192.0.2.0/24" } });
    await user.click(within(createDialog).getByRole("button", { name: "Create API Key" }));

    expect(await screen.findByRole("dialog", { name: "Your new API key" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("shown only once");
    expect(screen.getByLabelText("New API key secret")).toHaveValue("fpk_test_one_time_secret");
    expect(createKey).toHaveBeenCalledWith(expect.objectContaining({
      name: "Worker",
      environment: "test",
      ip_allowlist: ["192.0.2.0/24"],
      permissions: expect.arrayContaining(["payments:write", "webhooks:manage"]),
    }));

    await user.click(screen.getByRole("button", { name: "Copy new API key" }));
    expect(writeText).toHaveBeenCalledWith("fpk_test_one_time_secret");
    expect(screen.getByText(/Copied\. Confirm after saving/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I have saved this key" }));
    await waitFor(() => expect(screen.queryByDisplayValue("fpk_test_one_time_secret")).not.toBeInTheDocument());
  });
});