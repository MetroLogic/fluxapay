"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { logout, getToken } from "@/lib/auth";
import { DOCS_URLS } from "@/lib/docs";
import { isValidHttpsWebhookUrl } from "@/lib/webhookUrl";
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

  const handleBankSave = async () => {
    setIsSavingBank(true);
    setBankError("");
    try {
      await api.merchant.addBankAccount({
        account_name: accountName,
        account_number: accountNumber,
        bank_name: bankName,
        bank_code: bankCode,
        currency,
        country,
      });
      setBankSaved(true);
      setTimeout(() => setBankSaved(false), 3000);
      setInitialSnapshot(currentSnapshot);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to save bank details";
      setBankError(message);
    } finally {
      setIsSavingBank(false);
    }
  };

  const handleCheckoutLogoChange = (value: string) => {
    setCheckoutLogoUrl(value);
    const v = value.trim();
    if (v && !v.startsWith("https://")) {
      setCheckoutLogoError("Logo URL must start with https://");
    } else {
      setCheckoutLogoError("");
    }
  };

  const handleCheckoutBrandingSave = async () => {
    if (checkoutLogoError) return;
    setIsSavingCheckoutBranding(true);
    try {
      await api.merchant.updateProfile({
        checkout_logo_url:
          checkoutLogoUrl.trim() === "" ? null : checkoutLogoUrl.trim(),
        checkout_accent_color: checkoutAccentColor || null,
      });
      setCheckoutBrandingSaved(true);
      setTimeout(() => setCheckoutBrandingSaved(false), 3000);
      setInitialSnapshot(currentSnapshot);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to save branding";
      setCheckoutLogoError(message);
    } finally {
      setIsSavingCheckoutBranding(false);
    }
  };

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateApiKey = async () => {
    setIsRegenerating(true);
    try {
      const response = await api.keys.regenerate();
      setApiKey(response.api_key);
      setShowRegenerateModal(false);
      setKeyRegenerated(true);
      setTimeout(() => setKeyRegenerated(false), 5000);
    } catch (error) {
      console.error("Failed to regenerate API key:", error);
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Failed to regenerate API key. Please try again.",
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleWebhookUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWebhookUrl(value);
    if (!value.trim()) {
      setWebhookError("");
      return;
    }
    const v = isValidHttpsWebhookUrl(value);
    setWebhookError(v.ok ? "" : v.message);
  };

  const handleWebhookSave = async () => {
    if (webhookError) return;
    setIsSavingWebhook(true);
    try {
      await api.merchant.updateWebhook(webhookUrl);
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 3000);
      setInitialSnapshot(currentSnapshot);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Failed to save webhook URL";
      setWebhookError(message);
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleSignOutCurrentSession = () => {
    setIsSigningOut(true);
    logout();
  };
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
