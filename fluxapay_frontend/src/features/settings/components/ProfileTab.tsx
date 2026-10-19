"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { MerchantSettingsData, OnDirtyChange } from "./types";
import { AccountAndSettlementSection } from "./AccountAndSettlementSection";
import { CheckoutBrandingSection } from "./CheckoutBrandingSection";
import { BankDetailsSection } from "./BankDetailsSection";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeSelector } from "./ThemeSelector";

interface Props {
  data: MerchantSettingsData;
  onDirtyChange: OnDirtyChange;
}

const initialFlags = { account: false, branding: false, bank: false };

export function ProfileTab({ data, onDirtyChange }: Props) {
  const [dirty, setDirty] = useState<typeof initialFlags>(initialFlags);
  const { theme, isMounted, setTheme } = useTheme();

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
        <ThemeSelector theme={theme} onThemeChange={setTheme} disabled={!isMounted} />
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
