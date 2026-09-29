"use client";

import React, { useCallback, useRef } from "react";
import Link from "next/link";
import {
  User,
  Shield,
  Bell,
  Webhook,
  Key,
  FileCheck,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "kyc", label: "KYC", icon: FileCheck },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface SettingsTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hasUnsavedChanges: boolean;
  children: React.ReactNode;
}

export function SettingsTabs({
  activeTab,
  onTabChange,
  hasUnsavedChanges,
  children,
}: SettingsTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleTabClick = useCallback(
    (tabId: TabId) => {
      if (tabId === activeTab) return;
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          "You have unsaved changes. Are you sure you want to switch tabs?",
        );
        if (!confirmed) return;
      }
      onTabChange(tabId);
    },
    [activeTab, hasUnsavedChanges, onTabChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = TABS.findIndex((t) => t.id === activeTab);
      let nextIndex = currentIndex;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % TABS.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIndex = TABS.length - 1;
      } else {
        return;
      }

      const nextTab = TABS[nextIndex];
      handleTabClick(nextTab.id);
    },
    [activeTab, handleTabClick],
  );

  const handleDashboardClick = (e: React.MouseEvent) => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to leave?",
      );
      if (!confirmed) {
        e.preventDefault();
      }
    }
  };

  const currentTab = TABS.find((t) => t.id === activeTab);

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb aria-label="Settings breadcrumb">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard" onClick={handleDashboardClick}>
                Dashboard
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {activeTab === "profile" ? (
              <BreadcrumbPage>Settings</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <button
                  type="button"
                  onClick={() => handleTabClick("profile")}
                  className="cursor-pointer transition-colors hover:text-foreground"
                >
                  Settings
                </button>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {activeTab !== "profile" && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{currentTab?.label ?? activeTab}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account preferences and configurations.
        </p>
      </div>

      <div
        ref={tabListRef}
        role="tablist"
        aria-label="Settings tabs"
        className="flex overflow-x-auto border-b"
        onKeyDown={handleKeyDown}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabClick(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {children}
      </div>
    </div>
  );
}
