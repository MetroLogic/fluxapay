"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/Button";
import { type MerchantExportFormat } from "@/lib/api";

type Props = {
  onExport: (format: MerchantExportFormat) => void;
  exportingFormat?: MerchantExportFormat | null;
  /** Which formats to offer. Defaults to both, so existing callers don't change. */
  formats?: MerchantExportFormat[];
};

const LABELS: Record<MerchantExportFormat, string> = {
  csv: "Export CSV",
  pdf: "Export PDF",
};

export function ExportActionButtons({
  onExport,
  exportingFormat,
  formats = ["csv", "pdf"],
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {formats.map((format) => (
        <Button
          key={format}
          variant="secondary"
          className="gap-2"
          onClick={() => onExport(format)}
          disabled={!!exportingFormat}
        >
          <Download className="h-4 w-4" />
          {exportingFormat === format ? "Exporting..." : LABELS[format]}
        </Button>
      ))}
    </div>
  );
}
