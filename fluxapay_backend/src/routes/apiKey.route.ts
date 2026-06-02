import { Router } from 'express';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../controllers/apiKey.controller';
import { authenticateApiKey } from '../middleware/apiKeyAuth.middleware';
import { merchantApiKeyRateLimit } from '../middleware/rateLimit.middleware';

const router = Router();

/**
 * @swagger
 * /v1/api-keys:
 *   post:
 *     summary: Create a new API key
 *     tags: [API Keys]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - environment
 *             properties:
 *               name:
 *                 type: string
 *                 description: A descriptive name for the API key
 *                 example: "Production key"
 *               environment:
 *                 type: string
 *                 enum: [live, test]
 *                 description: The environment for this key
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 key:
 *                   type: string
 *                   description: The plaintext API key (only returned once)
 *                 environment:
 *                   type: string
 *                   enum: [live, test]
 *                 last_four:
 *                   type: string
 *                   description: Last 4 characters of the key
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request
 *       422:
 *         description: Maximum active keys limit reached
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', authenticateApiKey, merchantApiKeyRateLimit(), createApiKey);

/**
 * @swagger
 * /v1/api-keys:
 *   get:
 *     summary: List API keys
 *     tags: [API Keys]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       last_four:
 *                         type: string
 *                       environment:
 *                         type: string
 *                         enum: [live, test]
 *                       status:
 *                         type: string
 *                         enum: [active, revoked]
 *                       last_used_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 */
router.get('/', authenticateApiKey, merchantApiKeyRateLimit(), listApiKeys);

/**
 * @swagger
 * /v1/api-keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     tags: [API Keys]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       204:
 *         description: API key revoked successfully
 *       400:
 *         description: API key is already revoked
 *       404:
 *         description: API key not found
 */
router.delete('/:id', authenticateApiKey, merchantApiKeyRateLimit(), revokeApiKey);

export default router;
