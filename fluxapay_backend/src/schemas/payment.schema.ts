import { z } from "zod";
import {
  getMetadataMaxDepth,
  hasMetadataDepthBeyondLimit,
  MAX_PAYMENT_METADATA_BYTES,
} from "../utils/metadata.util";

const metadataSchema = z
  .record(z.string(), z.json())
  .superRefine((metadata, context) => {
    const sizeBytes = Buffer.byteLength(JSON.stringify(metadata), "utf8");
    if (sizeBytes > MAX_PAYMENT_METADATA_BYTES) {
      context.addIssue({
        code: "custom",
        message: `Metadata exceeds maximum size of ${MAX_PAYMENT_METADATA_BYTES} bytes`,
      });
    }
    const maxDepth = getMetadataMaxDepth();
    if (hasMetadataDepthBeyondLimit(metadata, maxDepth)) {
      context.addIssue({
        code: "custom",
        message: `Metadata depth exceeds maximum of ${maxDepth}`,
      });
    }
  });

const secureUrlSchema = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, {
    message: "Must be a valid https URL",
  });

export const createPaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  currency: z.literal("USDC", { error: "Only USDC is supported" }),
  customer_email: z.string().email("Invalid customer email"),
  description: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
  metadata: metadataSchema.optional(),
  customer_id: z.string().trim().min(1).optional(),
  success_url: secureUrlSchema.optional(),
  cancel_url: secureUrlSchema.optional(),
  expires_in_seconds: z.coerce.number().int().positive().optional(),
});
