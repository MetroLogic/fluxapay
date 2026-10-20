"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { refreshAccessToken } from "@/lib/api";
import {
  getMsUntilExpiry,
  handleSessionExpired,
  isTokenExpired,
} from "@/lib/session";

export const SESSION_TIMEOUT_WARNING_MS = 2 * 60 * 1000;

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [countdown, setCountdown] = useState("02:00");
  const [isExtending, setIsExtending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateWarningState = () => {
      const token = readToken();
      if (!token) {
        setIsWarningOpen(false);
        return;
      }

      if (isTokenExpired(token)) {
        setIsWarningOpen(false);
        handleSessionExpired({ silent: true });
        return;
      }

      const remainingMs = getMsUntilExpiry(token);
      if (remainingMs === null) {
        setIsWarningOpen(false);
        return;
      }

      if (remainingMs <= SESSION_TIMEOUT_WARNING_MS) {
        setIsWarningOpen(true);
        setCountdown(formatCountdown(remainingMs));

        if (remainingMs <= 0) {
          setIsWarningOpen(false);
          handleSessionExpired({ silent: true });
        }
      } else {
        setIsWarningOpen(false);
        setCountdown("02:00");
      }
    };

    updateWarningState();
    const intervalId = window.setInterval(updateWarningState, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const handleLogout = () => {
    setIsWarningOpen(false);
    handleSessionExpired({ silent: true });
  };

  const handleExtendSession = async () => {
    setIsExtending(true);

    try {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        handleLogout();
        return;
      }

      setIsWarningOpen(false);
      setCountdown("02:00");
    } catch {
      handleLogout();
    } finally {
      setIsExtending(false);
    }
  };

  return (
    <>
      {children}

      <Modal
        isOpen={isWarningOpen}
        onClose={handleLogout}
        title="Your session is about to expire"
      >
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            You will be signed out automatically in <span className="font-mono text-foreground">{countdown}</span>.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Log Out
            </button>
            <button
              type="button"
              onClick={handleExtendSession}
              disabled={isExtending}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isExtending ? "Extending..." : "Extend Session"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
