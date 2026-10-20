import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { AdminRole } from "../generated/client/client";

/** Upper bound on rows returned per page for the admin users list endpoint. */
const ADMIN_USERS_MAX_LIMIT = 100;

/** Default page size when `?limit` is absent or unusable. */
const ADMIN_USERS_DEFAULT_LIMIT = 20;

const ADMIN_ROLES = new Set<string>(Object.values(AdminRole));

/**
 * Clamp `?limit` so a single request cannot ask the database to materialise an
 * unbounded number of rows.
 */
function resolveLimit(rawLimit: unknown): number {
  const requested = Number(rawLimit);
  if (!Number.isFinite(requested) || requested <= 0) return ADMIN_USERS_DEFAULT_LIMIT;
  return Math.min(ADMIN_USERS_MAX_LIMIT, Math.floor(requested));
}

/**
 * `?role` is only honoured when it names a real role, otherwise a typo silently
 * returns an empty list instead of an error the admin can act on.
 */
function resolveRole(rawRole: unknown): AdminRole | undefined {
  if (typeof rawRole !== "string") return undefined;
  const candidate = rawRole.trim();
  if (!candidate || candidate === "all") return undefined;
  if (!ADMIN_ROLES.has(candidate)) return undefined;
  return candidate as AdminRole;
}

/**
 * `?is_active` accepts the usual truthy/falsey spellings so the admin UI can
 * pass the raw string straight through from a <select>.
 */
function resolveIsActive(rawValue: unknown): boolean | undefined {
  if (typeof rawValue !== "string") return undefined;
  const candidate = rawValue.trim().toLowerCase();
  if (!candidate || candidate === "all") return undefined;
  if (candidate === "true" || candidate === "1") return true;
  if (candidate === "false" || candidate === "0") return false;
  return undefined;
}

/**
 * GET /api/v1/admin/users
 * Paginated list of internal operator accounts with an optional search filter.
 */
export async function getAdminUsers(req: Request, res: Response) {
  try {
    const query = req.query as Record<string, unknown>;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = resolveLimit(query.limit);
    const search = typeof query.search === "string" ? query.search.trim() : "";
    const role = resolveRole(query.role);
    const isActive = resolveIsActive(query.is_active);

    const where: Record<string, unknown> = {
      ...(role && { role }),
      ...(isActive !== undefined && { is_active: isActive }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { id: { contains: search } },
          { role: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.adminUser.findMany({
        where: where as never,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          is_active: true,
          created_at: true,
        },
      }),
      prisma.adminUser.count({ where: where as never }),
    ]);

    const data = users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at,
    }));

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error: unknown) {
    console.error("Error in getAdminUsers:", error);
    return sendApiError(res, apiError(500, ErrorCode.INTERNAL_ERROR, "Failed to list admin users"));
  }
}
