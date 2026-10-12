"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import type { MerchantSettingsData, OnDirtyChange } from "./types";
import { AccountAndSettlementSection } from "./AccountAndSettlementSection";
import { CheckoutBrandingSection } from "./CheckoutBrandingSection";
import { BankDetailsSection } from "./BankDetailsSection";
import { useTheme } from "@/components/ThemeProvider";

interface Props {
  data: MerchantSettingsData;
  onDirtyChange: OnDirtyChange;
}

const initialFlags = { account: false, branding: false, bank: false };

export function ProfileTab({ data, onDirtyChange }: Props) {
  const [dirty, setDirty] = useState<typeof initialFlags>(initialFlags);
  const { isDark, isMounted, toggleTheme } = useTheme();

  const report = useCallback((key: keyof typeof initialFlags) => {
    return (value: boolean) =>
      setDirty((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    onDirtyChange(dirty.account || dirty.branding || dirty.bank);
  }, [dirty, onDirtyChange]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">Appearance</h3>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Dark Mode</p>
            <p className="text-sm text-muted-foreground">
              Switch between light and dark theme
            </p>
          </div>
          <button
            onClick={toggleTheme}
            disabled={!isMounted}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isDark ? 'var(--primary)' : 'var(--input)'
            }}
          >
            <span
              className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              style={{
                transform: isDark ? 'translateX(5px)' : 'translateX(1px)'
              }}
            />
          </button>
        </div>
      </div>
      <AccountAndSettlementSection
        initialBusinessName={data.businessName}
        initialContactEmail={data.contactEmail}
        initialSchedule={data.settlementSchedule}
        initialDay={data.settlementDay}
        nextSettlementDate={data.nextSettlementDate}
        onDirtyChange={report("account")}
      />
      <CheckoutBrandingSection
        initialLogoUrl={data.checkoutLogoUrl}
        initialAccentColor={data.checkoutAccentColor}
        onDirtyChange={report("branding")}
      />
      <BankDetailsSection
        initialAccountName={data.accountName}
        initialAccountNumber={data.accountNumber}
        initialBankName={data.bankName}
        initialBankCode={data.bankCode}
        currency={data.currency}
        country={data.country}
        onDirtyChange={report("bank")}
      />
    </div>
  );
}
