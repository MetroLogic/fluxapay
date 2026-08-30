/** Loaded merchant account settings shared across tabs. */
export interface MerchantSettingsData {
  businessName: string;
  contactEmail: string;
  webhookUrl: string;
  apiKey: string;
  settlementSchedule: "daily" | "weekly";
  settlementDay: number;
  nextSettlementDate: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  bankCode: string;
  currency: string;
  country: string;
  checkoutLogoUrl: string;
  checkoutAccentColor: string;
}

/** Small status type so a form needs only one piece of state for save UX. */
export type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "error"; message: string };

/** Reports whether the component currently has unsaved edits (for tab-switch guard). */
export type OnDirtyChange = (dirty: boolean) => void;
