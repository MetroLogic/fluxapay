import sanitizeHtml from "sanitize-html";

export const MAX_PAYMENT_METADATA_BYTES = 2 * 1024;
export const DEFAULT_METADATA_MAX_BYTES = MAX_PAYMENT_METADATA_BYTES;
export const DEFAULT_METADATA_MAX_DEPTH = 5;
export const DEFAULT_METADATA_MAX_KEYS = 50;

export function getMetadataMaxDepth(): number {
  return toPositiveInt(
    process.env.PAYMENT_METADATA_MAX_DEPTH,
    DEFAULT_METADATA_MAX_DEPTH,
  );
}

export function hasMetadataDepthBeyondLimit(
  value: unknown,
  maxDepth: number,
  depth = 1,
): boolean {
  if (depth > maxDepth) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) =>
      hasMetadataDepthBeyondLimit(item, maxDepth, depth + 1),
    );
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((nestedValue) =>
      hasMetadataDepthBeyondLimit(nestedValue, maxDepth, depth + 1),
    );
  }

  return false;
}

export class MetadataValidationError extends Error {
  public readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "MetadataValidationError";
  }
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function assertDepth(value: unknown, maxDepth: number, depth = 1): void {
  if (hasMetadataDepthBeyondLimit(value, maxDepth, depth)) {
    throw new MetadataValidationError(
      `Metadata depth exceeds maximum of ${maxDepth}`,
    );
  }
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeHtml(value, {
      allowedTags: [],
      allowedAttributes: {},
      disallowedTagsMode: "discard",
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      sanitized[key] = sanitizeValue(nestedValue);
    }
    return sanitized;
  }

  return value;
}

export function validateAndSanitizeMetadata(
  metadata: unknown,
  options?: { maxKeys?: number },
): Record<string, unknown> {
  if (metadata == null) {
    return {};
  }

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new MetadataValidationError("Metadata must be a JSON object");
  }

  const maxBytes = Math.min(
    toPositiveInt(process.env.PAYMENT_METADATA_MAX_BYTES, DEFAULT_METADATA_MAX_BYTES),
    MAX_PAYMENT_METADATA_BYTES,
  );
  const maxDepth = getMetadataMaxDepth();
  const maxKeys =
    options?.maxKeys ??
    toPositiveInt(process.env.PAYMENT_METADATA_MAX_KEYS, DEFAULT_METADATA_MAX_KEYS);

  const keyCount = Object.keys(metadata as Record<string, unknown>).length;
  if (keyCount > maxKeys) {
    throw new MetadataValidationError(
      `Metadata exceeds maximum key count of ${maxKeys}`,
    );
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(metadata);
  } catch {
    throw new MetadataValidationError("Metadata must be valid JSON");
  }

  if (serialized === undefined) {
    throw new MetadataValidationError("Metadata must be valid JSON");
  }

  const sizeBytes = Buffer.byteLength(serialized, "utf8");
  if (sizeBytes > maxBytes) {
    throw new MetadataValidationError(
      `Metadata exceeds maximum size of ${maxBytes} bytes`,
    );
  }

  assertDepth(metadata, maxDepth);

  return sanitizeValue(metadata) as Record<string, unknown>;
}
