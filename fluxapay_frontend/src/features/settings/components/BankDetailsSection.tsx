"use client";

import React, { useEffect, useState } from "react";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { api, ApiError } from "@/lib/api";
import { CheckCircle2, Landmark } from "lucide-react";
import { Spinner } from "./Spinner";
import type { OnDirtyChange, SaveState } from "./types";

interface Props {
  initialAccountName: string;
  initialAccountNumber: string;
  initialBankName: string;
  initialBankCode: string;
  currency: string;
  country: string;
  onDirtyChange: OnDirtyChange;
}

export function BankDetailsSection({
  initialAccountName,
  initialAccountNumber,
  initialBankName,
  initialBankCode,
  currency,
  country,
  onDirtyChange,
}: Props) {
  const [accountName, setAccountName] = useState(initialAccountName);
  const [accountNumber, setAccountNumber] = useState(initialAccountNumber);
  const [bankName, setBankName] = useState(initialBankName);
  const [bankCode, setBankCode] = useState(initialBankCode);
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  const dirty =
    accountName !== initialAccountName ||
    accountNumber !== initialAccountNumber ||
    bankName !== initialBankName ||
    bankCode !== initialBankCode;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = async () => {
    setSave({ status: "saving" });
    try {
      await api.merchant.addBankAccount({
        account_name: accountName,
        account_number: accountNumber,
        bank_name: bankName,
        bank_code: bankCode,
        currency,
        country,
      });
      setSave({ status: "saved" });
      onDirtyChange(false);
      setTimeout(() => setSave({ status: "idle" }), 3000);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to save bank details";
      setSave({ status: "error", message });
    }
  };

  const saving = save.status === "saving";
  const saved = save.status === "saved";

  return (
    <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
      <div className="flex items-center gap-2 text-primary font-semibold mb-4">
        <Landmark className="h-5 w-5" />
        <h3 className="text-lg">Payout Bank Details</h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Account Holder Name</label>
          <Input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Full name on bank account"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Bank Name</label>
            <Input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Zenith Bank"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Bank Code (Optional)</label>
            <Input
              type="text"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              placeholder="e.g. 057"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Account Number</label>
          <Input
            type="text"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Enter account number"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Country</label>
            <Input value={country} readOnly className="bg-muted/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Currency</label>
            <Input value={currency} readOnly className="bg-muted/50" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button variant="dark" onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Spinner />}
            {saved && <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Bank Details"}
          </Button>
        </div>
        {save.status === "error" && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
            <p className="text-sm">{save.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
