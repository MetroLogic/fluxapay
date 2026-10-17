/**
 * Admin script: re-encrypt Payment.encrypted_key_data stored under deprecated
 * KMS key versions with the currently active version (KMS_ACTIVE_KEY_VERSION).
 *
 * Usage:
 *   DRY_RUN=true KMS_ACTIVE_KEY_VERSION=2 ts-node src/scripts/reencrypt-kms-records.ts
 *   KMS_ACTIVE_KEY_VERSION=2 ts-node src/scripts/reencrypt-kms-records.ts
 *
 * Old key versions must remain configured until the run completes.
 */
import { PrismaClient } from "../generated/client/client";
import { KMSFactory } from "../services/kms/KMSFactory";
import { needsReencryption } from "../services/kms/keyVersioning";

const DRY_RUN = process.env.DRY_RUN === "true";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "100", 10);

export async function reencryptBatch(
  prisma: PrismaClient,
  cursor?: string,
): Promise<{ next?: string; scanned: number; updated: number }> {
  const kms = KMSFactory.getProvider();
  if (!kms.encrypt || !kms.decrypt) {
    throw new Error("KMS provider does not support encrypt/decrypt");
  }
  const rows = await prisma.payment.findMany({
    where: { encrypted_key_data: { not: null } },
    select: { id: true, encrypted_key_data: true },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  let updated = 0;
  for (const row of rows) {
    const current = row.encrypted_key_data as string;
    if (!needsReencryption(current)) continue;
    const fresh = await kms.encrypt(await kms.decrypt(current));
    if (!DRY_RUN) {
      await prisma.payment.update({
        where: { id: row.id },
        data: { encrypted_key_data: fresh },
      });
    }
    updated++;
  }
  return {
    next: rows.length === BATCH_SIZE ? rows[rows.length - 1].id : undefined,
    scanned: rows.length,
    updated,
  };
}

async function main() {
  const prisma = new PrismaClient();
  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;
  do {
    const r = await reencryptBatch(prisma, cursor);
    scanned += r.scanned;
    updated += r.updated;
    cursor = r.next;
  } while (cursor);
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}scanned=${scanned} reencrypted=${updated}`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
