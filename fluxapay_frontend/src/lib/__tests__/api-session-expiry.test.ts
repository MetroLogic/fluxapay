import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("react-hot-toast", () => {
  const error = vi.fn();
  return { default: { error, success: vi.fn() }, error };
});

import toast from "react-hot-toast";
import { api, ApiError, getRefreshToken, refreshAccessToken, storeRefreshToken } from "@/lib/api";
import { SESSION_EXPIRED_MESSAGE, resetSessionExpiryLatch } from "@/lib/session";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("401 handling in the API layer", () => {
  let assignedHref: string;

  beforeEach(() => {
    resetSessionExpiryLatch();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(toast.error).mockClear();

    assignedHref = "";
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: {
        pathname: "/dashboard",
        search: "",
        get href() {
          return assignedHref;
        },
        set href(value: string) {
          assignedHref = value;
        },
      },
    });
  });

  it("redirects to /login when an authenticated call returns 401", async () => {
    localStorage.setItem("token", "stale-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Token expired" }, 401)),
    );

    await expect(api.merchant.getMe()).rejects.toBeInstanceOf(ApiError);

    expect(assignedHref).toBe(`/login?redirect=${encodeURIComponent("/dashboard")}`);
    vi.unstubAllGlobals();
  });

  it("clears the stored token on 401", async () => {
    localStorage.setItem("token", "stale-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Token expired" }, 401)),
    );

    await expect(api.merchant.getMe()).rejects.toBeInstanceOf(ApiError);

    expect(localStorage.getItem("token")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("tells the user why they were logged out", async () => {
    localStorage.setItem("token", "stale-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Token expired" }, 401)),
    );

    await expect(api.merchant.getMe()).rejects.toBeInstanceOf(ApiError);

    expect(toast.error).toHaveBeenCalledWith(
      SESSION_EXPIRED_MESSAGE,
      expect.objectContaining({ id: "session-expired" }),
    );
    vi.unstubAllGlobals();
  });

  it("leaves other error statuses alone", async () => {
    localStorage.setItem("token", "good-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Server exploded" }, 500)),
    );

    await expect(api.merchant.getMe()).rejects.toBeInstanceOf(ApiError);

    expect(assignedHref).toBe("");
    expect(localStorage.getItem("token")).toBe("good-token");
    vi.unstubAllGlobals();
  });
});

describe("refreshAccessToken", () => {
  beforeEach(() => {
    resetSessionExpiryLatch();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("returns null when there is no refresh token to spend", async () => {
    await expect(refreshAccessToken()).resolves.toBeNull();
  });

  it("exchanges the refresh token and stores the new access token", async () => {
    storeRefreshToken("refresh-abc", true);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: "new-access", refresh_token: "refresh-def", expires_in: 900 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshAccessToken();

    expect(result).toEqual({ accessToken: "new-access", expiresIn: 900 });
    expect(localStorage.getItem("token")).toBe("new-access");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ refresh_token: "refresh-abc" });
    vi.unstubAllGlobals();
  });

  it("stores the rotated refresh token, discarding the spent one", async () => {
    storeRefreshToken("refresh-abc", true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ access_token: "new-access", refresh_token: "refresh-def" }),
      ),
    );

    await refreshAccessToken();

    expect(getRefreshToken()).toBe("refresh-def");
    vi.unstubAllGlobals();
  });

  it("keeps the session-only storage choice across a refresh", async () => {
    storeRefreshToken("refresh-abc", false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ access_token: "new-access", refresh_token: "refresh-def" }),
      ),
    );

    await refreshAccessToken();

    expect(sessionStorage.getItem("token")).toBe("new-access");
    expect(localStorage.getItem("token")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("throws when the server rejects the refresh token", async () => {
    storeRefreshToken("refresh-abc", true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Invalid refresh token" }, 401)),
    );

    await expect(refreshAccessToken()).rejects.toBeInstanceOf(ApiError);
    vi.unstubAllGlobals();
  });

  it("throws when the response omits an access token", async () => {
    storeRefreshToken("refresh-abc", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ expires_in: 900 })));

    await expect(refreshAccessToken()).rejects.toBeInstanceOf(ApiError);
    vi.unstubAllGlobals();
  });
});
