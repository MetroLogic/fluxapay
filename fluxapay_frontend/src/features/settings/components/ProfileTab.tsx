"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { MerchantSettingsData, OnDirtyChange } from "./types";
import { AccountAndSettlementSection } from "./AccountAndSettlementSection";
import { CheckoutBrandingSection } from "./CheckoutBrandingSection";
import { BankDetailsSection } from "./BankDetailsSection";

interface Props {
  data: MerchantSettingsData;
  onDirtyChange: OnDirtyChange;
}

const initialFlags = { account: false, branding: false, bank: false };

export function ProfileTab({ data, onDirtyChange }: Props) {
  const [dirty, setDirty] = useState<typeof initialFlags>(initialFlags);

  const report = useCallback((key: keyof typeof initialFlags) => {
    return (value: boolean) =>
      setDirty((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    onDirtyChange(dirty.account || dirty.branding || dirty.bank);
  }, [dirty, onDirtyChange]);

  return (
    <div className="space-y-6">
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
