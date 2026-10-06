// Jest hoists jest.mock calls above imports, so the mock object is defined via a
// factory that closes over a module-scoped const (same pattern as payment.controller.test.ts).

const prismaMock = {
  adminUser: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock("../../config/prisma", () => ({
  prisma: prismaMock,
}));

import { getAdminUsers } from "../adminUser.controller";
import { AdminRole } from "../../generated/client/client";

const buildRes = () => {
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return res;
};

const buildReq = (query: Record<string, unknown> = {}) => ({ query }) as any;

const rows = [
  {
    id: "admin_1",
    email: "alice@example.com",
    role: AdminRole.super_admin,
    is_active: true,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
  },
];

describe("getAdminUsers controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.adminUser.findMany.mockResolvedValue(rows);
    prismaMock.adminUser.count.mockResolvedValue(1);
  });

  describe("search filter", () => {
    it("matches email, id and role case-insensitively with contains", async () => {
      await getAdminUsers(buildReq({ search: "alice" }), buildRes());

      const args = prismaMock.adminUser.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { email: { contains: "alice", mode: "insensitive" } },
        { id: { contains: "alice" } },
        { role: { contains: "alice", mode: "insensitive" } },
      ]);
    });

    it("trims surrounding whitespace before building the clause", async () => {
      await getAdminUsers(buildReq({ search: "  alice  " }), buildRes());

      const args = prismaMock.adminUser.findMany.mock.calls[0][0];
      expect(args.where.OR[0]).toEqual({
        email: { contains: "alice", mode: "insensitive" },
      });
    });

    it("omits the OR clause entirely when search is empty or whitespace-only", async () => {
      await getAdminUsers(buildReq({ search: "   " }), buildRes());

      const args = prismaMock.adminUser.findMany.mock.calls[0][0];
      expect(args.where).not.toHaveProperty("OR");
    });

    it("applies the same where clause to the count query", async () => {
      await getAdminUsers(buildReq({ search: "alice" }), buildRes());

      const findWhere = prismaMock.adminUser.findMany.mock.calls[0][0].where;
      const countWhere = prismaMock.adminUser.count.mock.calls[0][0].where;
      expect(countWhere).toEqual(findWhere);
    });
  });

  describe("limit clamp", () => {
    it("caps limit at 100 when a larger value is requested", async () => {
      await getAdminUsers(buildReq({ limit: "5000" }), buildRes());

      expect(prismaMock.adminUser.findMany.mock.calls[0][0].take).toBe(100);
    });

    it("defaults to 20 when limit is absent", async () => {
      await getAdminUsers(buildReq(), buildRes());

      expect(prismaMock.adminUser.findMany.mock.calls[0][0].take).toBe(20);
    });

    it("defaults to 20 when limit is not a positive number", async () => {
      await getAdminUsers(buildReq({ limit: "0" }), buildRes());
      expect(prismaMock.adminUser.findMany.mock.calls[0][0].take).toBe(20);

      jest.clearAllMocks();
      prismaMock.adminUser.findMany.mockResolvedValue(rows);
      prismaMock.adminUser.count.mockResolvedValue(1);

      await getAdminUsers(buildReq({ limit: "abc" }), buildRes());
      expect(prismaMock.adminUser.findMany.mock.calls[0][0].take).toBe(20);
    });

    it("translates page into a skip offset", async () => {
      await getAdminUsers(buildReq({ page: "3", limit: "20" }), buildRes());

      expect(prismaMock.adminUser.findMany.mock.calls[0][0].skip).toBe(40);
    });
  });

  describe("role and status filters", () => {
    it("applies a valid role filter", async () => {
      await getAdminUsers(buildReq({ role: "finance" }), buildRes());

      expect(prismaMock.adminUser.findMany.mock.calls[0][0].where.role).toBe("finance");
    });

    it("ignores an unknown role rather than returning an empty list", async () => {
      await getAdminUsers(buildReq({ role: "wizard" }), buildRes());

      expect(prismaMock.adminUser.findMany.mock.calls[0][0].where).not.toHaveProperty("role");
    });

    it("treats 'all' as no role filter", async () => {
      await getAdminUsers(buildReq({ role: "all" }), buildRes());

      expect(prismaMock.adminUser.findMany.mock.calls[0][0].where).not.toHaveProperty("role");
    });

    it.each([
      ["true", true],
      ["1", true],
      ["false", false],
      ["0", false],
    ])("maps is_active=%s to %s", async (raw, expected) => {
      await getAdminUsers(buildReq({ is_active: raw }), buildRes());

      expect(prismaMock.adminUser.findMany.mock.calls[0][0].where.is_active).toBe(expected);
    });

    it("omits is_active when the value is unusable", async () => {
      await getAdminUsers(buildReq({ is_active: "maybe" }), buildRes());

      expect(prismaMock.adminUser.findMany.mock.calls[0][0].where).not.toHaveProperty(
        "is_active",
      );
    });
  });

  describe("response shape", () => {
    it("maps snake_case rows to the camelCase contract", async () => {
      const res = buildRes();

      await getAdminUsers(buildReq(), res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [
            {
              id: "admin_1",
              email: "alice@example.com",
              role: "super_admin",
              isActive: true,
              createdAt: rows[0].created_at,
            },
          ],
        }),
      );
    });

    it("never selects the password column", async () => {
      await getAdminUsers(buildReq(), buildRes());

      const select = prismaMock.adminUser.findMany.mock.calls[0][0].select;
      expect(select).not.toHaveProperty("password");
      expect(Object.keys(select).sort()).toEqual([
        "created_at",
        "email",
        "id",
        "is_active",
        "role",
      ]);
    });

    it("derives totalPages from the total and the clamped limit", async () => {
      prismaMock.adminUser.count.mockResolvedValue(250);
      const res = buildRes();

      await getAdminUsers(buildReq({ limit: "100" }), res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: { total: 250, page: 1, limit: 100, totalPages: 3 },
        }),
      );
    });
  });

  describe("error handling", () => {
    it("returns a 500 payload when the query throws", async () => {
      prismaMock.adminUser.findMany.mockRejectedValue(new Error("db down"));
      const res = buildRes();

      await getAdminUsers(buildReq(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Failed to list admin users" }),
      );
    });
  });
});
