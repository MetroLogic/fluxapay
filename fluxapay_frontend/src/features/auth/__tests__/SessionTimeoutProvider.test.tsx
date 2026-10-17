import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionTimeoutProvider } from "../SessionTimeoutProvider";
import { refreshAccessToken } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  refreshAccessToken: vi.fn(),
}));

function makeJwt(claims: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

describe("SessionTimeoutProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows the countdown warning when a session is within 2 minutes of expiry", () => {
    const expiresAt = Date.now() + 90_000;
    localStorage.setItem("token", makeJwt({ exp: expiresAt / 1000 }));

    render(
      <SessionTimeoutProvider>
        <div>Protected content</div>
      </SessionTimeoutProvider>,
    );

    expect(screen.getByText("Your session is about to expire")).toBeInTheDocument();
    expect(screen.getByText("01:30")).toBeInTheDocument();
  });

  it("refreshes the token when the user clicks Extend Session", async () => {
    const expiresAt = Date.now() + 90_000;
    localStorage.setItem("token", makeJwt({ exp: expiresAt / 1000 }));
    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: makeJwt({ exp: (Date.now() + 10 * 60_000) / 1000 }),
      expiresIn: 600,
    });

    render(
      <SessionTimeoutProvider>
        <div>Protected content</div>
      </SessionTimeoutProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /extend session/i }));
      await Promise.resolve();
    });

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Your session is about to expire")).not.toBeInTheDocument();
  });
});
