import sanitizeHtml from "sanitize-html";

export const DEFAULT_METADATA_MAX_BYTES = 16 * 1024;
export const DEFAULT_METADATA_MAX_DEPTH = 5;

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
  if (depth > maxDepth) {
    throw new MetadataValidationError(
      `Metadata depth exceeds maximum of ${maxDepth}`,
    );
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      assertDepth(item, maxDepth, depth + 1);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      assertDepth(nestedValue, maxDepth, depth + 1);
    }
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
): Record<string, unknown> {
  if (metadata == null) {
    return {};
  }

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new MetadataValidationError("Metadata must be a JSON object");
  }

  const maxBytes = toPositiveInt(
    process.env.PAYMENT_METADATA_MAX_BYTES,
    DEFAULT_METADATA_MAX_BYTES,
  );
  const maxDepth = toPositiveInt(
    process.env.PAYMENT_METADATA_MAX_DEPTH,
    DEFAULT_METADATA_MAX_DEPTH,
  );

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
