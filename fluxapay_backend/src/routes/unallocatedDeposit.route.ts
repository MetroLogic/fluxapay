/**
 * Admin review queue for deposits that could not be credited to a charge
 * (issue #1258). Protected by X-Admin-Secret.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { adminAuth } from "../middleware/adminAuth.middleware";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { ErrorCode } from "../types/errors";
import { AuthRequest } from "../types/express";
import {
  listUnallocatedDeposits,
  reviewUnallocatedDeposit,
} from "../services/unallocatedDeposit.service";

const router = Router();

const REASONS = ["missing_memo", "invalid_memo", "spoofed_asset", "unsupported_asset", "underpaid"] as const;
const STATUSES = ["pending_review", "resolved", "refunded", "ignored"] as const;

const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  reason: z.enum(REASONS).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const reviewBodySchema = z.object({
  status: z.enum(["resolved", "refunded", "ignored"]),
  note: z.string().trim().max(1000).optional(),
  payment_id: z.string().trim().min(1).optional(),
});

function validationError(res: Response, error: z.ZodError) {
  return sendApiError(
    res,
    apiError(400, ErrorCode.VALIDATION_ERROR, "Validation failed", {
      errors: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    }),
  );
}

/**
 * @swagger
 * /api/v1/admin/unallocated-deposits:
 *   get:
 *     operationId: listUnallocatedDeposits
 *     summary: List deposits awaiting manual review
 *     description: Deposits with a missing or invalid memo, a counterfeit or unsupported asset, or an underpaid amount.
 *     tags: [Admin]
 *     security:
 *       - adminSecret: []
 *     parameters:
 *       - in: query
 *         name: status
 *         description: Filter by review status.
 *         schema: { type: string, enum: [pending_review, resolved, refunded, ignored] }
 *       - in: query
 *         name: reason
 *         description: Filter by why the deposit was not credited.
 *         schema: { type: string, enum: [missing_memo, invalid_memo, spoofed_asset, unsupported_asset, underpaid] }
 *       - in: query
 *         name: page
 *         description: Page number to return (1-indexed).
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         description: Maximum number of items to return per page.
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated unallocated deposits
 *       401:
 *         description: Unauthorized
 */
router.get("/", adminAuth, async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed.error);
  try {
    res.json(await listUnallocatedDeposits(parsed.data));
  } catch (error) {
    sendApiError(res, error);
  }
});

/**
 * @swagger
 * /api/v1/admin/unallocated-deposits/{id}:
 *   patch:
 *     operationId: reviewUnallocatedDeposit
 *     summary: Close out a deposit under review
 *     tags: [Admin]
 *     security:
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique identifier of the unallocated deposit.
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [resolved, refunded, ignored] }
 *               note: { type: string }
 *               payment_id: { type: string, description: Charge the funds were manually credited to. }
 *     responses:
 *       200:
 *         description: Updated deposit
 *       404:
 *         description: Not found
 *       409:
 *         description: Already reviewed
 */
router.patch("/:id", adminAuth, async (req: Request, res: Response) => {
  const parsed = reviewBodySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const admin = (req as AuthRequest).adminUser;
  try {
    const updated = await reviewUnallocatedDeposit({
      id: String(req.params.id),
      status: parsed.data.status,
      note: parsed.data.note,
      paymentId: parsed.data.payment_id,
      reviewedBy: admin?.id ?? "admin_secret",
    });
    res.json({ data: updated });
  } catch (error) {
    sendApiError(res, error);
  }
});

export default router;
