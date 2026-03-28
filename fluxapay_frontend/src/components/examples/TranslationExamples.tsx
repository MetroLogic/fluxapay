"use client";

import { useTranslations, useLocale } from "next-intl";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
} from "@/lib/i18n-utils";

/**
 * Example component showing various translation patterns
 */
export function TranslationExamples() {
  const t = useTranslations();
  const locale = useLocale();

  // Example data
  const amount = 1234.56;
  const date = new Date("2024-01-15");
  const recentDate = new Date("2024-01-15T10:00:00Z"); // Fixed date for purity

  return (
    <div className="space-y-6 p-6">
      {/* Simple translation */}
      <section>
        <h2 className="text-xl font-bold mb-2">Simple Translations</h2>
        <p>{t("common.getStarted")}</p>
        <p>{t("hero.title")}</p>
      </section>

      {/* Nested translations */}
      <section>
        <h2 className="text-xl font-bold mb-2">Nested Translations</h2>
        <h3>{t("whyFluxapay.instant.title")}</h3>
        <p>{t("whyFluxapay.instant.description")}</p>
      </section>

      {/* Currency formatting */}
      <section>
        <h2 className="text-xl font-bold mb-2">Currency Formatting</h2>
        <p>USD: {formatCurrency(amount, "USD", locale)}</p>
        <p>EUR: {formatCurrency(amount, "EUR", locale)}</p>
        <p>BRL: {formatCurrency(amount, "BRL", locale)}</p>
      </section>

      {/* Date formatting */}
      <section>
        <h2 className="text-xl font-bold mb-2">Date Formatting</h2>
        <p>Date: {formatDate(date, locale)}</p>
        <p>DateTime: {formatDateTime(date, locale)}</p>
        <p>Relative: {formatRelativeTime(recentDate, locale)}</p>
      </section>

      {/* Status translations */}
      <section>
        <h2 className="text-xl font-bold mb-2">Status Translations</h2>
        <p>{t("status.pending")}</p>
        <p>{t("status.completed")}</p>
        <p>{t("status.failed")}</p>
      </section>
    </div>
  );
}

/**
 * Example: Payment card component with translations
 */
export function PaymentCard({
  amount,
  currency,
  status,
  date,
}: {
  amount: number;
  currency: string;
  status: string;
  date: Date;
}) {
  const t = useTranslations("payment");
  const tStatus = useTranslations("status");
  const locale = useLocale();

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">{t("amount")}</span>
        <span className="text-lg font-bold">
          {formatCurrency(amount, currency, locale)}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">{t("status")}</span>
        <span
          className={`px-2 py-1 rounded text-sm ${
            status === "completed"
              ? "bg-green-100 text-green-800"
              : status === "pending"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-red-100 text-red-800"
          }`}
        >
          {tStatus(status as "completed" | "pending" | "failed")}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">{t("date")}</span>
        <span className="text-sm">{formatDate(date, locale)}</span>
      </div>
    </div>
  );
}

/**
 * Example: Dashboard stats with translations
 */
export function DashboardStats() {
  const t = useTranslations("dashboard");
  const locale = useLocale();

  const stats = [
    { label: t("totalRevenue"), value: 125430.5, currency: "USD" },
    { label: t("successfulPayments"), value: 1234 },
    { label: t("pendingSettlements"), value: 45 },
    { label: t("activeCustomers"), value: 892 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <div key={index} className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-2">{stat.label}</p>
          <p className="text-2xl font-bold">
            {stat.currency
              ? formatCurrency(stat.value, stat.currency, locale)
              : stat.value.toLocaleString(locale)}
          </p>
        </div>
      ))}
    </div>
  );
}
