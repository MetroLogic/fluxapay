import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/admin.middleware';
import { getAuditLogs, getAuditLogByIdHandler } from '../controllers/audit.controller';

const router = Router();

// All audit log routes require authentication and admin authorization
router.use(authenticateToken);
router.use(authorizeAdmin);

// Query audit logs with filters
router.get('/audit-logs', getAuditLogs);

// Get specific audit log by ID
router.get('/audit-logs/:id', getAuditLogByIdHandler);

export default router;
