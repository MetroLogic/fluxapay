import { Keypair } from "@stellar/stellar-sdk";
import { PrismaClient, DepositAddressStatus } from "../generated/client/client";
import { KMSFactory } from "./kms";
import * as crypto from "crypto";
import { eventBus, AppEvents } from "./EventService";

const prisma = new PrismaClient();

export class DepositAddressService {
  /**
   * Pre-generates Stellar keypairs and stores them in the DepositAddress pool.
   * @param count Number of addresses to generate
   */
  static async generatePoolAddresses(count: number): Promise<number> {
    const kmsProvider = KMSFactory.getProvider();
    let generated = 0;

    for (let i = 0; i < count; i++) {
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();
      const secretKey = keypair.secret();

      // Encrypt the secret key for at-rest storage
      let encryptedSecret: string;
      if (kmsProvider.encrypt) {
        encryptedSecret = await kmsProvider.encrypt(secretKey);
      } else {
        // Fallback local encryption if KMS provider lacks encrypt method
        encryptedSecret = this._localEncrypt(secretKey);
      }

      await prisma.depositAddress.create({
        data: {
          public_key: publicKey,
          secret_key: encryptedSecret,
          derivation_path: "random", // We use random generation, no BIP44 path needed
          status: "available",
        },
      });
      generated++;
    }

    return generated;
  }

  /**
   * Allocates an available address from the pool for a payment.
   * @param paymentId The payment ID
   */
  static async allocateAddress(paymentId: string): Promise<string | null> {
    return await prisma.$transaction(async (tx) => {
      // Find an available address and lock it for update
      const address = await tx.$queryRaw<any[]>`
        SELECT * FROM "DepositAddress"
        WHERE status = 'available'
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
      `;

      if (!address || address.length === 0) {
        return null; // Pool is empty
      }

      const selected = address[0];

      // Mark it as assigned
      const updated = await tx.depositAddress.update({
        where: { id: selected.id },
        data: {
          status: "assigned",
          assigned_payment_id: paymentId,
        },
      });

      return updated.public_key;
    });
  }

  /**
   * Releases an assigned address to the cooldown state.
   * @param paymentId The payment ID
   */
  static async releaseAddress(paymentId: string): Promise<void> {
    const address = await prisma.depositAddress.findUnique({
      where: { assigned_payment_id: paymentId },
    });

    if (!address) {
      return;
    }

    // Cooldown for 24 hours
    const cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.depositAddress.update({
      where: { id: address.id },
      data: {
        status: "cooldown",
        assigned_payment_id: null,
        cooldown_until: cooldownUntil,
      },
    });
  }

  /**
   * Retrieves pool stats for the admin dashboard.
   */
  static async getPoolStats() {
    const stats = await prisma.depositAddress.groupBy({
      by: ["status"],
      _count: {
        status: true,
      },
    });

    const result = {
      available: 0,
      assigned: 0,
      cooldown: 0,
      total: 0,
    };

    for (const stat of stats) {
      if (stat.status === "available") result.available = stat._count.status;
      if (stat.status === "assigned") result.assigned = stat._count.status;
      if (stat.status === "cooldown") result.cooldown = stat._count.status;
      result.total += stat._count.status;
    }

    return result;
  }

  /**
   * Recycles addresses that have completed their cooldown period.
   * To be called by a cron job.
   */
  static async recycleAddresses(): Promise<number> {
    const result = await prisma.depositAddress.updateMany({
      where: {
        status: "cooldown",
        cooldown_until: {
          lte: new Date(),
        },
      },
      data: {
        status: "available",
        cooldown_until: null,
      },
    });

    return result.count;
  }

  /**
   * Local AES-256-GCM encrypt (used when no KMS encrypt available)
   */
  private static _localEncrypt(plaintext: string): string {
    const seed = process.env.HD_WALLET_SEED || "default-hd-key";
    const key = crypto
      .createHash("sha256")
      .update(seed + ":hd-key-data")
      .digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let enc = cipher.update(plaintext, "utf8", "hex");
    enc += cipher.final("hex");
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${enc}`;
  }

  /**
   * Initializes event listeners for address pool management.
   */
  static initializeListeners() {
    eventBus.on(AppEvents.PAYMENT_EXPIRED, async (payment) => {
      if (payment && payment.id) {
        try {
          await this.releaseAddress(payment.id);
        } catch (error) {
          console.error(`Failed to release address for expired payment ${payment.id}:`, error);
        }
      }
    });

    eventBus.on(AppEvents.PAYMENT_CONFIRMED, async (payment) => {
      // Payment confirmed means we've swept the funds or it's settled.
      // We can release the address for cooldown.
      if (payment && payment.id) {
        try {
          await this.releaseAddress(payment.id);
        } catch (error) {
          console.error(`Failed to release address for confirmed payment ${payment.id}:`, error);
        }
      }
    });
  }
}
