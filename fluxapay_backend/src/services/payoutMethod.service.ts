/**
 * Merchant payout methods (issue #1249).
 *
 * Every query is scoped to the authenticated merchant, so one merchant can
 * never read or archive another's payout details (a foreign id is a 404).
 * Account and routing numbers are encrypted at rest and only ever returned
 * masked.
 */

import { prisma } from "../config/prisma";
import { apiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { getLogger } from "../utils/logger";
import { encryptField, fingerprint, maskValue } from "../utils/fieldEncryption.util";
import { SUPPORTED_PAYOUT_COUNTRIES, type CreatePayoutMethodInput } from "../schemas/payoutMethod.schema";

const logger = getLogger("PayoutMethods");

/** Non-archived payout methods a merchant may hold at once. */
export const MAX_PAYOUT_METHODS = 10;

export type PayoutMethodStatus = "active" | "pending_verification" | "archived";

interface PayoutMethodRow {
  id: string;
  merchantId: string;
  type: string;
  status: PayoutMethodStatus;
  country: string;
  currency: string;
  bank_name: string | null;
  bank_code: string | null;
  beneficiary_name: string;
  account_number_last4: string;
  routing_number_last4: string | null;
  label: string | null;
  is_default: boolean;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Public shape: no ciphertext, no fingerprint, numbers masked. */
export interface PayoutMethodDto {
  id: string;
  type: string;
  status: PayoutMethodStatus;
  country: string;
  currency: string;
  bank_name: string | null;
  bank_code: string | null;
  beneficiary_name: string;
  account_number_masked: string;
  account_number_last4: string;
  routing_number_masked: string | null;
  label: string | null;
  is_default: boolean;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function toPayoutMethodDto(row: PayoutMethodRow): PayoutMethodDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    country: row.country,
    currency: row.currency,
    bank_name: row.bank_name,
    bank_code: row.bank_code,
    beneficiary_name: row.beneficiary_name,
    account_number_masked: maskValue(row.account_number_last4.padStart(10, "0")),
    account_number_last4: row.account_number_last4,
    routing_number_masked: row.routing_number_last4 ? maskValue(row.routing_number_last4.padStart(9, "0")) : null,
    label: row.label,
    is_default: row.is_default,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

type PayoutDelegate = {
  findMany: (args: unknown) => Promise<PayoutMethodRow[]>;
  findFirst: (args: unknown) => Promise<PayoutMethodRow | null>;
  count: (args: unknown) => Promise<number>;
  create: (args: unknown) => Promise<PayoutMethodRow>;
  update: (args: unknown) => Promise<PayoutMethodRow>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};

function model(client: unknown = prisma): PayoutDelegate {
  const delegate = (client as { merchantPayoutMethod?: PayoutDelegate }).merchantPayoutMethod;
  if (!delegate) throw new Error("merchantPayoutMethod model unavailable");
  return delegate;
}

export async function listPayoutMethods(
  merchantId: string,
  options: { includeArchived?: boolean } = {},
): Promise<PayoutMethodDto[]> {
  const rows = await model().findMany({
    where: {
      merchantId,
      ...(options.includeArchived ? {} : { status: { not: "archived" } }),
    },
    orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
  });
  return rows.map(toPayoutMethodDto);
}

export async function createPayoutMethod(
  merchantId: string,
  input: CreatePayoutMethodInput,
): Promise<PayoutMethodDto> {
  const rules = SUPPORTED_PAYOUT_COUNTRIES[input.country];
  const currency = rules.currency;
  const accountFingerprint = fingerprint(input.country, input.bank_code ?? "", input.routing_number ?? "", input.account_number);

  const activeCount = await model().count({ where: { merchantId, status: { not: "archived" } } });
  if (activeCount >= MAX_PAYOUT_METHODS) {
    throw apiError(
      422,
      ErrorCode.VALIDATION_ERROR,
      `A merchant can have at most ${MAX_PAYOUT_METHODS} payout methods; archive one first`,
    );
  }

  const duplicate = await model().findFirst({
    where: { merchantId, account_fingerprint: accountFingerprint, status: { not: "archived" } },
  });
  if (duplicate) {
    throw apiError(409, ErrorCode.CONFLICT, "This bank account is already configured as a payout method");
  }

  // The first payout method becomes the default automatically.
  const makeDefault = input.is_default === true || activeCount === 0;

  const created = await (prisma as unknown as {
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  }).$transaction(async (tx) => {
    if (makeDefault) {
      await model(tx).updateMany({ where: { merchantId, is_default: true }, data: { is_default: false } });
    }
    return model(tx).create({
      data: {
        merchantId,
        type: input.type,
        // Bank details must be verified (e.g. account-name lookup / micro
        // deposit) before settlements are sent to them.
        status: "pending_verification",
        country: input.country,
        currency,
        bank_name: input.bank_name ?? null,
        bank_code: input.bank_code ?? null,
        beneficiary_name: input.beneficiary_name,
        account_number_encrypted: encryptField(input.account_number),
        account_number_last4: input.account_number.slice(-4),
        account_fingerprint: accountFingerprint,
        routing_number_encrypted: input.routing_number ? encryptField(input.routing_number) : null,
        routing_number_last4: input.routing_number ? input.routing_number.slice(-4) : null,
        label: input.label ?? null,
        is_default: makeDefault,
      },
    });
  });

  logger.info("Payout method added", {
    merchantId,
    payoutMethodId: created.id,
    country: input.country,
    currency,
    last4: created.account_number_last4,
  });
  return toPayoutMethodDto(created);
}

/**
 * Archive (soft-delete) a payout method. Archived rows are kept for
 * settlement history. If the default is archived, the newest remaining
 * method becomes the default.
 */
export async function archivePayoutMethod(merchantId: string, id: string): Promise<PayoutMethodDto> {
  const existing = await model().findFirst({ where: { id, merchantId } });
  if (!existing) {
    throw apiError(404, ErrorCode.NOT_FOUND, "Payout method not found");
  }
  if (existing.status === "archived") {
    throw apiError(409, ErrorCode.CONFLICT, "Payout method is already archived");
  }

  const archived = await (prisma as unknown as {
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  }).$transaction(async (tx) => {
    const updated = await model(tx).update({
      where: { id },
      data: { status: "archived", is_default: false, archived_at: new Date() },
    });
    if (existing.is_default) {
      const next = await model(tx).findFirst({
        where: { merchantId, id: { not: id }, status: { not: "archived" } },
        orderBy: { created_at: "desc" },
      });
      if (next) {
        await model(tx).update({ where: { id: next.id }, data: { is_default: true } });
      }
    }
    return updated;
  });

  logger.info("Payout method archived", { merchantId, payoutMethodId: id });
  return toPayoutMethodDto(archived);
}
