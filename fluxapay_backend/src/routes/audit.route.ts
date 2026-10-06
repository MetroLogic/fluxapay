import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { adminAuth } from '../middleware/adminAuth.middleware';
import { getAuditLogs, getAuditLogByIdHandler, getSettlementPayoutPayload } from '../controllers/audit.controller';
import { getAdminPayments } from '../controllers/payment.controller';
import { getAdminUsers } from '../controllers/adminUser.controller';

const router = Router();

// All audit log routes require authentication and admin authorization
router.use(authenticateToken);
router.use(adminAuth);

/**
 * @swagger
 * /api/v1/admin/payments:
 *   get:
 *     summary: Query payments across all merchants with filters (Admin only)
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *       - adminSecret: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: currency
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of payments across the platform
 *       401:
 *         description: Unauthorized
 */
router.get('/payments', getAdminPayments);

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: List internal operator accounts with search and filters (Admin only)
 *     tags: [Admin - Users]
 *     security:
 *       - bearerAuth: []
 *       - adminSecret: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         description: Case-insensitive partial match on email, id, or role
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [support, finance, super_admin] }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: List of admin users
 *       401:
 *         description: Unauthorized
 */
router.get('/users', getAdminUsers);

/**
 * @swagger
 * /api/v1/admin/audit-logs:
 *   get:
 *     summary: Query audit logs with filters (Admin only)
 *     tags: [Admin - Audit]
 *     security:
 *       - bearerAuth: []
 *       - adminSecret: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of audit logs
 *       401:
 *         description: Unauthorized
 */
router.get('/audit-logs', getAuditLogs);

/**
 * @swagger
 * /api/v1/admin/audit-logs/{id}:
 *   get:
 *     summary: Get specific audit log by ID (Admin only)
 *     tags: [Admin - Audit]
 *     security:
 *       - bearerAuth: []
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit log details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Audit log not found
 */
router.get('/audit-logs/:id', getAuditLogByIdHandler);

/**
 * @swagger
 * /api/v1/admin/settlements/{settlement_id}/payout-payload:
 *   get:
 *     summary: Get raw payout partner payload for a settlement (Admin only)
 *     tags: [Admin - Settlements]
 *     security:
 *       - bearerAuth: []
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: settlement_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Raw payout partner payload
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Settlement not found or no payload available
 */
router.get('/settlements/:settlement_id/payout-payload', getSettlementPayoutPayload);

export default router;
