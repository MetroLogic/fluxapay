"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

export default function CustomerFaq() {
  const t = useTranslations("customerFaq");
  const [search, setSearch] = useState("");
  const searchTerm = search.trim().toLocaleLowerCase();

  const questions = [
    { id: "wallets", question: t("wallets.question"), answer: t("wallets.answer") },
    { id: "memo", question: t("memo.question"), answer: t("memo.answer") },
    { id: "amountAsset", question: t("amountAsset.question"), answer: t("amountAsset.answer") },
    { id: "confirmation", question: t("confirmation.question"), answer: t("confirmation.answer") },
    { id: "status", question: t("status.question"), answer: t("status.answer") },
  ];

  const filteredQuestions = questions.filter(({ question, answer }) =>
    `${question} ${answer}`.toLocaleLowerCase().includes(searchTerm)
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center sm:mb-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-blue-700">
            FluxaPay
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">{t("subtitle")}</p>
        </header>

        <div className="relative mb-6">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-slate-900 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {filteredQuestions.length > 0 ? (
          <div className="space-y-3">
            {filteredQuestions.map(({ id, question, answer }) => (
              <details
                key={id}
                className="group rounded-xl border border-slate-200 bg-white shadow-sm open:border-blue-200"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-slate-900 marker:hidden">
                  <span>{question}</span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-xl font-normal text-blue-700 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="border-t border-slate-100 px-5 py-4 leading-relaxed text-slate-600">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-slate-600">
            {t("noResults")}
          </p>
        )}
      </div>
    </main>
  );
}
