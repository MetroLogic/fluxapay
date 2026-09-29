"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/Button";
import { type MerchantExportFormat } from "@/lib/api";

type Props = {
  onExport: (format: MerchantExportFormat) => void;
  exportingFormat?: MerchantExportFormat | null;
};

export function ExportActionButtons({ onExport, exportingFormat }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        className="gap-2"
        onClick={() => onExport("csv")}
        disabled={!!exportingFormat}
      >
        <Download className="h-4 w-4" />
        {exportingFormat === "csv" ? "Exporting..." : "Export CSV"}
      </Button>
      <Button
        variant="secondary"
        className="gap-2"
        onClick={() => onExport("pdf")}
        disabled={!!exportingFormat}
      >
        <Download className="h-4 w-4" />
        {exportingFormat === "pdf" ? "Exporting..." : "Export PDF"}
      </Button>
    </div>
  );
}
