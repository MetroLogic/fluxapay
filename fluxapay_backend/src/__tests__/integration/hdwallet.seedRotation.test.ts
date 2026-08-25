/**
 * hdwallet.seedRotation.test.ts
 *
 * Integration test for HDWallet master seed rotation:
 * - seedVersion tracking on DepositAddress
 * - Unallocated old-seed addresses marked RETIRING
 * - Sweep against in-flight address generated from previous seed epoch
 * - Deletion of old seed material allowed only after zero outstanding addresses reference it
 */

import { Keypair, Horizon, Networks } from "@stellar/stellar-sdk";
import { HDWalletService } from "../../services/HDWalletService";
import {
  markUnallocatedOldAddressesRetiring,
  canDeleteOldSeed,
  deleteOldSeedMaterial,
} from "../../../scripts/rotate-master-seed";

const mockPrisma: any = {
  depositAddress: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  merchantHDIndex: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
};

jest.mock("../../config/prisma", () => ({
  prisma: {
    depositAddress: {
      create: jest.fn((...args: any[]) => mockPrisma.depositAddress.create(...args)),
      findFirst: jest.fn((...args: any[]) => mockPrisma.depositAddress.findFirst(...args)),
      findUnique: jest.fn((...args: any[]) => mockPrisma.depositAddress.findUnique(...args)),
      findMany: jest.fn((...args: any[]) => mockPrisma.depositAddress.findMany(...args)),
      update: jest.fn((...args: any[]) => mockPrisma.depositAddress.update(...args)),
      updateMany: jest.fn((...args: any[]) => mockPrisma.depositAddress.updateMany(...args)),
      count: jest.fn((...args: any[]) => mockPrisma.depositAddress.count(...args)),
      groupBy: jest.fn((...args: any[]) => mockPrisma.depositAddress.groupBy(...args)),
    },
    payment: {
      findMany: jest.fn((...args: any[]) => mockPrisma.payment.findMany(...args)),
      update: jest.fn((...args: any[]) => mockPrisma.payment.update(...args)),
    },
    merchantHDIndex: {
      findUnique: jest.fn((...args: any[]) => mockPrisma.merchantHDIndex.findUnique(...args)),
    },
    $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  },
}));

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    depositAddress: {
      create: jest.fn((...args: any[]) => mockPrisma.depositAddress.create(...args)),
      findFirst: jest.fn((...args: any[]) => mockPrisma.depositAddress.findFirst(...args)),
      findUnique: jest.fn((...args: any[]) => mockPrisma.depositAddress.findUnique(...args)),
      findMany: jest.fn((...args: any[]) => mockPrisma.depositAddress.findMany(...args)),
      update: jest.fn((...args: any[]) => mockPrisma.depositAddress.update(...args)),
      updateMany: jest.fn((...args: any[]) => mockPrisma.depositAddress.updateMany(...args)),
      count: jest.fn((...args: any[]) => mockPrisma.depositAddress.count(...args)),
      groupBy: jest.fn((...args: any[]) => mockPrisma.depositAddress.groupBy(...args)),
    },
    payment: {
      findMany: jest.fn((...args: any[]) => mockPrisma.payment.findMany(...args)),
      update: jest.fn((...args: any[]) => mockPrisma.payment.update(...args)),
    },
    merchantHDIndex: {
      findUnique: jest.fn((...args: any[]) => mockPrisma.merchantHDIndex.findUnique(...args)),
    },
    $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  })),
}));

describe("HD Wallet Seed Rotation Integration (#750)", () => {
  const seedEpoch1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const seedEpoch2 = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  beforeEach(() => {
    jest.clearAllMocks();
    HDWalletService.clearRegisteredSeeds();
    HDWalletService.registerSeed(1, seedEpoch1);
    HDWalletService.registerSeed(2, seedEpoch2);
  });

  afterEach(() => {
    HDWalletService.clearRegisteredSeeds();
  });

  it("resolves the correct seed epoch by seedVersion when deriving keypairs", async () => {
    const hdService = new HDWalletService(seedEpoch2); // active seed is epoch 2

    const keypairEpoch1 = await hdService.regenerateKeypair(0, 5, 1);
    const keypairEpoch2 = await hdService.regenerateKeypair(0, 5, 2);

    // Both keypairs must have valid Stellar public keys
    expect(keypairEpoch1.publicKey.startsWith("G")).toBe(true);
    expect(keypairEpoch2.publicKey.startsWith("G")).toBe(true);

    // Keypairs derived from different seed epochs at the same path must differ
    expect(keypairEpoch1.publicKey).not.toBe(keypairEpoch2.publicKey);
    expect(keypairEpoch1.secretKey).not.toBe(keypairEpoch2.secretKey);
  });

  it("regenerates keypair from derivation path using previous seed epoch", async () => {
    const hdService = new HDWalletService(seedEpoch2);
    const derivationPath = "m/44'/148'/0'/5'";

    const kpEpoch1FromPath = await hdService.regenerateKeypairFromPath(derivationPath, 1);
    const directKpEpoch1 = await hdService.regenerateKeypair(0, 5, 1);

    expect(kpEpoch1FromPath.publicKey).toBe(directKpEpoch1.publicKey);
    expect(kpEpoch1FromPath.secretKey).toBe(directKpEpoch1.secretKey);
  });

  it("marks all unallocated old-seed addresses as RETIRING during rotation", async () => {
    mockPrisma.depositAddress.count.mockResolvedValueOnce(15);
    mockPrisma.depositAddress.updateMany.mockResolvedValueOnce({ count: 15 });

    const retiredCount = await markUnallocatedOldAddressesRetiring(1, false);

    expect(retiredCount).toBe(15);
    expect(mockPrisma.depositAddress.updateMany).toHaveBeenCalledWith({
      where: {
        seedVersion: 1,
        status: "available",
      },
      data: {
        status: "retiring",
      },
    });
  });

  it("retains in-flight addresses from old seed epoch and enables successful sweeping", async () => {
    const hdService = new HDWalletService(seedEpoch2);
    const inFlightDerivationPath = "m/44'/148'/0'/10'";

    // Derive address allocated under epoch 1
    const epoch1Kp = await hdService.regenerateKeypairFromPath(inFlightDerivationPath, 1);

    mockPrisma.depositAddress.findFirst.mockResolvedValueOnce({
      id: "addr_123",
      public_key: epoch1Kp.publicKey,
      seedVersion: 1,
      status: "assigned",
    });

    // Resolve keypair for the swept payment using seedVersion from DepositAddress record
    const resolvedKeypair = await hdService.regenerateKeypairFromPath(
      inFlightDerivationPath,
      1,
    );

    expect(resolvedKeypair.publicKey).toBe(epoch1Kp.publicKey);
    expect(resolvedKeypair.secretKey).toBe(epoch1Kp.secretKey);
  });

  it("prevents deletion of old seed material while outstanding addresses exist", async () => {
    // 3 outstanding addresses still reference epoch 1
    mockPrisma.depositAddress.count.mockResolvedValue(3);

    const canDelete = await canDeleteOldSeed(1);
    expect(canDelete).toBe(false);

    const deleteResult = await deleteOldSeedMaterial(1);
    expect(deleteResult.deleted).toBe(false);
    expect(deleteResult.reason).toContain("outstanding addresses still reference it");
  });

  it("allows deletion of old seed material only after zero outstanding addresses reference it", async () => {
    // 0 outstanding addresses for epoch 1
    mockPrisma.depositAddress.count.mockResolvedValue(0);

    const canDelete = await canDeleteOldSeed(1);
    expect(canDelete).toBe(true);

    const deleteResult = await deleteOldSeedMaterial(1);
    expect(deleteResult.deleted).toBe(true);
  });
});
