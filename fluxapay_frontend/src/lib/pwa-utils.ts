/**
 * PWA utility types and helpers for the FluxaPay merchant dashboard.
 */

export interface ManifestIcon {
  src: string;       // URL path to the icon file, e.g. "/icons/icon-192x192.png"
  sizes: string;     // WxH format, e.g. "192x192"
  type: string;      // MIME type, e.g. "image/png"
  purpose?: string;  // "any" | "maskable" | "any maskable"
}

export interface WebAppManifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  display: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  orientation: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

export type CachingStrategy = "cache-first" | "network-first" | "passthrough";

/**
 * Returns true when the given value is a structurally valid ManifestIcon entry:
 * src, sizes, and type must all be non-empty strings.
 */
export function isValidManifestIcon(icon: unknown): icon is ManifestIcon {
  if (typeof icon !== "object" || icon === null) return false;
  const { src, sizes, type } = icon as Record<string, unknown>;
  return (
    typeof src === "string" && src.length > 0 &&
    typeof sizes === "string" && sizes.length > 0 &&
    typeof type === "string" && type.length > 0
  );
}
