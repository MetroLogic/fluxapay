"use client";

import React, { useEffect, useState } from "react";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { api, ApiError } from "@/lib/api";
import { CheckCircle2, CalendarClock, Clock, Shield } from "lucide-react";
import { Spinner } from "./Spinner";
import type { OnDirtyChange, SaveState } from "./types";

interface Props {
  initialBusinessName: string;
  initialContactEmail: string;
  initialSchedule: "daily" | "weekly";
  initialDay: number;
  nextSettlementDate: string;
  onDirtyChange: OnDirtyChange;
}

export function AccountAndSettlementSection({
  initialBusinessName,
  initialContactEmail,
  initialSchedule,
  initialDay,
  nextSettlementDate,
  onDirtyChange,
}: Props) {
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [contactEmail, setContactEmail] = useState(initialContactEmail);
  const [settlementSchedule, setSettlementSchedule] = useState<
    "daily" | "weekly"
  >(initialSchedule);
  const [settlementDay, setSettlementDay] = useState(initialDay);
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  const dirty =
    businessName !== initialBusinessName ||
    contactEmail !== initialContactEmail ||
    settlementSchedule !== initialSchedule ||
    (initialSchedule === "weekly" && settlementDay !== initialDay);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = async () => {
    setSave({ status: "saving" });
    try {
      await api.merchant.updateProfile({
        business_name: businessName,
        email: contactEmail,
        settlement_schedule: settlementSchedule,
        settlement_day:
          settlementSchedule === "weekly" ? settlementDay : undefined,
      });
      setSave({ status: "saved" });
      onDirtyChange(false);
      setTimeout(() => setSave({ status: "idle" }), 3000);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to save changes";
      setSave({ status: "error", message });
    }
  };

  const saving = save.status === "saving";
  const saved = save.status === "saved";

  return (
    <>
      {/* Account Details */}
      <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
        <div className="flex items-center gap-2 text-primary font-semibold mb-4">
          <Shield className="h-5 w-5" />
          <h3 className="text-lg">Account Details</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Business Name</label>
            <Input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Enter your business name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Contact Email</label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contact@example.com"
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="dark"
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              {saving && <Spinner />}
              {saved && <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
            </Button>
          </div>
          {save.status === "error" && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
              <p className="text-sm">{save.message}</p>
            </div>
          )}
        </div>
      </div>

      {/* Settlement Schedule */}
      <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
        <div className="flex items-center gap-2 text-primary font-semibold mb-4">
          <CalendarClock className="h-5 w-5" />
          <h3 className="text-lg">Settlement Schedule</h3>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Schedule Frequency</label>
              <select
                value={settlementSchedule}
                onChange={(e) =>
                  setSettlementSchedule(e.target.value as "daily" | "weekly")
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            {settlementSchedule === "weekly" && (
              <div>
                <label className="block text-sm font-medium mb-2">Settlement Day</label>
                <select
                  value={settlementDay}
                  onChange={(e) => setSettlementDay(parseInt(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                </select>
              </div>
            )}
          </div>
          {nextSettlementDate && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <Clock className="h-4 w-4" />
                <span>
                  Next Scheduled Settlement:{" "}
                  {new Date(nextSettlementDate).toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="dark"
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              {saving && <Spinner />}
              {saved && <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Saving..." : "Update Schedule"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
