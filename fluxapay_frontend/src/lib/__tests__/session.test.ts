import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("react-hot-toast", () => {
  const error = vi.fn();
  return { default: { error, success: vi.fn() }, error };
});

import toast from "react-hot-toast";
import {
  SESSION_EXPIRED_MESSAGE,
  REFRESH_LEAD_MS,
  clearSessionStorageKeys,
  getMsUntilExpiry,
  getTokenExpiryMs,
  handleSessionExpired,
  isTokenExpired,
  resetSessionExpiryLatch,
  scheduleAt,
} from "@/lib/session";

/** Build an unsigned JWT whose payload carries the given claims. */
function makeJwt(claims: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

const NOW = 1_800_000_000_000;

describe("session", () => {
  beforeEach(() => {
    resetSessionExpiryLatch();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(toast.error).mockClear();
  });

  describe("getTokenExpiryMs", () => {
    it("reads the exp claim as milliseconds", () => {
      const token = makeJwt({ exp: NOW / 1000 });
      expect(getTokenExpiryMs(token)).toBe(NOW);
    });

    it("decodes base64url payloads containing - and _", () => {
      const token = makeJwt({ exp: NOW / 1000, sub: "a>b?c>d?e" });
      expect(getTokenExpiryMs(token)).toBe(NOW);
    });

    it("returns null for a token with no exp", () => {
      expect(getTokenExpiryMs(makeJwt({ sub: "merchant-1" }))).toBeNull();
    });

    it("returns null for a non-numeric exp", () => {
      expect(getTokenExpiryMs(makeJwt({ exp: "soon" }))).toBeNull();
    });

    it("returns null for a malformed token rather than throwing", () => {
      expect(getTokenExpiryMs("not-a-jwt")).toBeNull();
      expect(getTokenExpiryMs("")).toBeNull();
      expect(getTokenExpiryMs("a.!!!not-base64!!!.c")).toBeNull();
    });
  });

  describe("getMsUntilExpiry / isTokenExpired", () => {
    it("reports the remaining lifetime", () => {
      const token = makeJwt({ exp: (NOW + 5 * 60_000) / 1000 });
      expect(getMsUntilExpiry(token, NOW)).toBe(5 * 60_000);
    });

    it("reports a negative remainder for an expired token", () => {
      const token = makeJwt({ exp: (NOW - 60_000) / 1000 });
      expect(getMsUntilExpiry(token, NOW)).toBe(-60_000);
      expect(isTokenExpired(token, NOW)).toBe(true);
    });

    it("treats a token expiring exactly now as expired", () => {
      expect(isTokenExpired(makeJwt({ exp: NOW / 1000 }), NOW)).toBe(true);
    });

    it("treats an undecodable token as expired", () => {
      expect(isTokenExpired("garbage", NOW)).toBe(true);
    });

    it("reports a live token as not expired", () => {
      expect(isTokenExpired(makeJwt({ exp: (NOW + 60_000) / 1000 }), NOW)).toBe(false);
    });
  });

  describe("clearSessionStorageKeys", () => {
    it("removes tokens from both storages", () => {
      localStorage.setItem("token", "a");
      localStorage.setItem("refresh_token", "b");
      localStorage.setItem("isAdmin", "true");
      sessionStorage.setItem("token", "c");
      sessionStorage.setItem("refresh_token", "d");

      clearSessionStorageKeys();

      expect(localStorage.getItem("token")).toBeNull();
      expect(localStorage.getItem("refresh_token")).toBeNull();
      expect(localStorage.getItem("isAdmin")).toBeNull();
      expect(sessionStorage.getItem("token")).toBeNull();
      expect(sessionStorage.getItem("refresh_token")).toBeNull();
    });
  });

  describe("handleSessionExpired", () => {
    let assignedHref: string;

    beforeEach(() => {
      assignedHref = "";
      Object.defineProperty(window, "location", {
        writable: true,
        configurable: true,
        value: {
          pathname: "/dashboard/invoices",
          search: "?page=2",
          get href() {
            return assignedHref;
          },
          set href(value: string) {
            assignedHref = value;
          },
        },
      });
    });

    it("clears the token", () => {
      localStorage.setItem("token", "stale");
      handleSessionExpired();
      expect(localStorage.getItem("token")).toBeNull();
    });

    it("shows the session expired toast", () => {
      handleSessionExpired();
      expect(toast.error).toHaveBeenCalledWith(
        SESSION_EXPIRED_MESSAGE,
        expect.objectContaining({ id: "session-expired" }),
      );
    });

    it("redirects to /login preserving where the user was", () => {
      handleSessionExpired();
      expect(assignedHref).toBe(
        `/login?redirect=${encodeURIComponent("/dashboard/invoices?page=2")}`,
      );
    });

    it("only acts once, however many 401s arrive", () => {
      handleSessionExpired();
      handleSessionExpired();
      handleSessionExpired();

      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it("does nothing when already on the login page", () => {
      window.location.pathname = "/login";
      handleSessionExpired();

      expect(toast.error).not.toHaveBeenCalled();
      expect(assignedHref).toBe("");
    });

    it("can skip the toast when asked", () => {
      handleSessionExpired({ silent: true });

      expect(toast.error).not.toHaveBeenCalled();
      expect(assignedHref).toContain("/login");
    });
  });

  describe("scheduleAt", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("runs the callback after the delay", () => {
      const cb = vi.fn();
      scheduleAt(1_000, cb);

      vi.advanceTimersByTime(999);
      expect(cb).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("cancel prevents the callback", () => {
      const cb = vi.fn();
      const cancel = scheduleAt(1_000, cb);

      cancel();
      vi.advanceTimersByTime(10_000);
      expect(cb).not.toHaveBeenCalled();
    });

    it("does not fire early for a delay beyond the 32-bit timeout ceiling", () => {
      const cb = vi.fn();
      // A 30-day token: setTimeout would overflow and fire immediately.
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      scheduleAt(thirtyDays, cb);

      vi.advanceTimersByTime(2_147_483_647);
      expect(cb).not.toHaveBeenCalled();

      vi.advanceTimersByTime(thirtyDays);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("fires immediately for a non-positive delay", () => {
      const cb = vi.fn();
      scheduleAt(-5_000, cb);

      vi.advanceTimersByTime(0);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  it("uses a 60 second refresh lead", () => {
    expect(REFRESH_LEAD_MS).toBe(60_000);
  });
});
