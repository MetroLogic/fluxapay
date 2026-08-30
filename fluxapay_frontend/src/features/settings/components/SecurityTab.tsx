"use client";

import React, { useState } from "react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { logout } from "@/lib/auth";
import { AlertTriangle, CheckCircle2, Shield } from "lucide-react";
import { Spinner } from "./Spinner";

interface SecurityTabProps {
  sessionNote: string;
}

export function SecurityTab({ sessionNote }: SecurityTabProps) {
  return (
    <div className="space-y-6">
      <SecuritySection sessionNote={sessionNote} />
      <DangerZoneSection />
    </div>
  );
}

function SecuritySection({ sessionNote }: { sessionNote: string }) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);

  const handleSignOutCurrentSession = () => {
    setIsSigningOut(true);
    logout();
  };

  const handleSignOutAllSessions = async () => {
    setIsSigningOutAll(true);
    try {
      await api.auth.logoutAllSessions();
    } catch (error) {
      if (error instanceof ApiError && error.status !== 404) {
        console.error("Logout-all request failed:", error);
      }
    } finally {
      logout();
    }
  };

  return (
    <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
      <div className="flex items-center gap-2 text-primary font-semibold mb-4">
        <Shield className="h-5 w-5" />
        <h3 className="text-lg">Security Settings</h3>
      </div>
      <div className="space-y-4">
        <div className="rounded-lg border bg-background p-4">
          <p className="font-medium">Session status</p>
          <p className="text-sm text-muted-foreground mt-1">{sessionNote}</p>
        </div>
        <div className="flex items-center justify-between p-4 rounded-lg border bg-background">
          <div>
            <p className="font-medium">Two-Factor Authentication</p>
            <p className="text-sm text-muted-foreground">
              Add an extra layer of security to your account
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={twoFactorEnabled}
              onChange={(e) => setTwoFactorEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#5649DF]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5649DF]"></div>
          </label>
        </div>
        <div className="rounded-lg border bg-background p-4 space-y-3">
          <div>
            <p className="font-medium">Session controls</p>
            <p className="text-sm text-muted-foreground">
              Sign out this device or invalidate all active sessions.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleSignOutCurrentSession}
              disabled={isSigningOut || isSigningOutAll}
            >
              {isSigningOut ? "Signing out..." : "Sign out this session"}
            </Button>
            <Button
              variant="destructive"
              onClick={handleSignOutAllSessions}
              disabled={isSigningOut || isSigningOutAll}
            >
              {isSigningOutAll ? "Signing out..." : "Sign out all sessions"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DangerZoneSection() {
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const [deletionRequestScheduled, setDeletionRequestScheduled] =
    useState(false);
  const [deletionRequestError, setDeletionRequestError] = useState("");

  const handleRequestDeletion = async () => {
    setIsRequestingDeletion(true);
    setDeletionRequestError("");
    try {
      await api.merchant.requestDeletion();
      setDeletionRequestScheduled(true);
      setShowDeletionModal(false);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Failed to request account deletion";
      setDeletionRequestError(message);
    } finally {
      setIsRequestingDeletion(false);
    }
  };

  return (
    <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
      <div className="flex items-center gap-2 text-red-700 font-semibold mb-4">
        <AlertTriangle className="h-5 w-5" />
        <h3 className="text-lg">Danger Zone</h3>
      </div>
      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium">Request account deletion</p>
            <p className="text-sm text-muted-foreground mt-1">
              Schedule your account for admin review, deletion, and PII
              anonymization.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => {
              setDeletionRequestError("");
              setShowDeletionModal(true);
            }}
            disabled={deletionRequestScheduled}
            className="shrink-0"
          >
            {deletionRequestScheduled
              ? "Deletion Requested"
              : "Request Account Deletion"}
          </Button>
        </div>
        {deletionRequestScheduled && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-sm font-medium">
              Account deletion request scheduled for admin review.
            </p>
          </div>
        )}
        {deletionRequestError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
            <p className="text-sm">{deletionRequestError}</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={showDeletionModal}
        onClose={() => {
          if (!isRequestingDeletion) setShowDeletionModal(false);
        }}
        title="Request Account Deletion"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-sm">
                This starts an admin review for account deletion and PII
                anonymization. You may lose access to account data after the
                request is processed.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            The request will be submitted to FluxaPay admins for review before
            any account deletion or anonymization action is completed.
          </p>
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeletionModal(false)}
              className="flex-1"
              disabled={isRequestingDeletion}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRequestDeletion}
              className="flex-1 gap-2"
              disabled={isRequestingDeletion}
            >
              {isRequestingDeletion && <Spinner className="h-4 w-4" />}
              {isRequestingDeletion ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
