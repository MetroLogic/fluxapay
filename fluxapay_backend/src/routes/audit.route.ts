import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { adminAuth } from '../middleware/adminAuth.middleware';
import { getAuditLogs, getAuditLogByIdHandler } from '../controllers/audit.controller';

const router = Router();

// All audit log routes require authentication and admin authorization
router.use(authenticateToken);
router.use(adminAuth);

/**
 * @swagger
 * /api/admin/audit-logs:
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
 * /api/admin/audit-logs/{id}:
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

export default router;
