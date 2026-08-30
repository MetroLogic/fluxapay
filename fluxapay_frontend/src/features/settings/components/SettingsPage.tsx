"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getSessionNote } from "@/lib/sessionNote";
import { SettingsTabs, type TabId } from "./SettingsTabs";
import { ProfileTab } from "./ProfileTab";
import { SecurityTab } from "./SecurityTab";
import { NotificationsTab } from "./NotificationsTab";
import { WebhooksTab } from "./WebhooksTab";
import { ApiKeysTab } from "./ApiKeysTab";
import { KycTab } from "./KycTab";
import type { MerchantSettingsData } from "./types";

const DEFAULT_DATA: MerchantSettingsData = {
  businessName: "",
  contactEmail: "",
  webhookUrl: "",
  apiKey: "No API key generated",
  settlementSchedule: "daily",
  settlementDay: 1,
  nextSettlementDate: "",
  accountName: "",
  accountNumber: "",
  bankName: "",
  bankCode: "",
  currency: "",
  country: "",
  checkoutLogoUrl: "",
  checkoutAccentColor: "#2563eb",
};

function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <svg
          className="h-8 w-8 animate-spin mx-auto mb-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <circle cx="12" cy="12" r="10" className="opacity-30" />
          <path d="M22 12a10 10 0 0 1-10 10" />
        </svg>
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<MerchantSettingsData>(DEFAULT_DATA);
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<TabId, boolean>>>({});
  const [sessionNote, setSessionNote] = useState("Current session active");

  const hasUnsavedChanges = Object.values(dirtyTabs).some(Boolean);

  useEffect(() => {
    setSessionNote(getSessionNote());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await api.merchant.getMe();
        const merchant = response.merchant as Record<string, unknown>;

        let currency = "";
        let country = "";
        const bankAccount = merchant.bankAccount as
          | Record<string, string | undefined>
          | undefined;
        if (bankAccount) {
          currency = bankAccount.currency || "";
          country = bankAccount.country || "";
        } else {
          currency = (merchant.settlement_currency as string) || "";
          country = (merchant.country as string) || "";
        }

        const nextData: MerchantSettingsData = {
          ...DEFAULT_DATA,
          businessName: (merchant.business_name as string) || "",
          contactEmail: (merchant.email as string) || "",
          webhookUrl: (merchant.webhook_url as string) || "",
          apiKey: (merchant.api_key as string) || "No API key generated",
          settlementSchedule:
            (merchant.settlement_schedule as "daily" | "weekly") || "daily",
          settlementDay: (merchant.settlement_day as number) ?? 1,
          accountName: bankAccount?.account_name || "",
          accountNumber: bankAccount?.account_number || "",
          bankName: bankAccount?.bank_name || "",
          bankCode: bankAccount?.bank_code || "",
          currency,
          country,
          checkoutLogoUrl:
            typeof merchant.checkout_logo_url === "string"
              ? merchant.checkout_logo_url
              : "",
          checkoutAccentColor:
            typeof merchant.checkout_accent_color === "string" &&
            merchant.checkout_accent_color
              ? merchant.checkout_accent_color
              : "#2563eb",
        };

        try {
          const summary = await api.settlements.summary();
          if (summary.next_settlement_date) {
            nextData.nextSettlementDate = summary.next_settlement_date;
          }
        } catch (err) {
          console.error("Failed to load settlement summary:", err);
        }

        if (!cancelled) setData(nextData);
      } catch (error) {
        console.error("Failed to load merchant data:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDirtyChange = useCallback((tab: TabId) => {
    return (dirty: boolean) =>
      setDirtyTabs((prev) => (prev[tab] === dirty ? prev : { ...prev, [tab]: dirty }));
  }, []);

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <SettingsTabs
      activeTab={activeTab}
      onTabChange={setActiveTab}
      hasUnsavedChanges={hasUnsavedChanges}
    >
      {activeTab === "profile" && (
        <ProfileTab data={data} onDirtyChange={handleDirtyChange("profile")} />
      )}
      {activeTab === "security" && <SecurityTab sessionNote={sessionNote} />}
      {activeTab === "notifications" && <NotificationsTab />}
      {activeTab === "webhooks" && (
        <WebhooksTab
          initialWebhookUrl={data.webhookUrl}
          onDirtyChange={handleDirtyChange("webhooks")}
        />
      )}
      {activeTab === "api-keys" && <ApiKeysTab initialApiKey={data.apiKey} />}
      {activeTab === "kyc" && <KycTab />}
    </SettingsTabs>
  );
}
