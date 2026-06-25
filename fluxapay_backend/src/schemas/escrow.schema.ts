import { z } from "zod";

export const initializeSchema = z.object({
  payment_id: z.string().min(1, "Payment ID is required"),
  amount: z.string().min(1, "Amount is required"),
  currency: z.string().min(1, "Currency is required"),
  merchant_public_key: z.string().min(1, "Merchant public key is required"),
});
