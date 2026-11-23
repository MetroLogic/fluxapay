"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { AlertCircle } from "lucide-react";

const OFFLINE_MESSAGES: Record<string, string> = {
  en: "You are offline. Showing cached data. Reconnect to see the latest updates.",
  es: "Estás sin conexión. Mostrando datos en caché. Reconéctate para ver las últimas actualizaciones.",
  fr: "Vous êtes hors ligne. Affichage des données en cache. Reconnectez-vous pour voir les dernières mises à jour.",
  ar: "أنت غير متصل بالإنترنت. يعرض البيانات المخزنة مؤقتًا. أعد الاتصال لرؤية آخر التحديثات.",
  pt: "Você está offline. Exibindo dados em cache. Reconecte-se para ver as últimas atualizações.",
  sw: "Wewe si na mtandao. Inaonyesha data inayohifadhiwa. Kuunganisha upya ili kuona mwisho wa sasisho.",
};

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  const lang = (typeof document !== "undefined" && document.documentElement.lang) || "en";
  const message = OFFLINE_MESSAGES[lang] || OFFLINE_MESSAGES.en;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 border-b border-yellow-200 px-4 py-3">
      <div className="flex items-center justify-center gap-2 max-w-7xl mx-auto">
        <AlertCircle className="h-4 w-4 text-yellow-600" aria-hidden="true" />
        <span className="text-sm text-yellow-800" role="status" aria-live="polite">
          {message}
        </span>
      </div>
    </div>
  );
}
