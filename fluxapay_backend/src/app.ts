import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { specs } from "./docs/swagger";
import { PrismaClient } from "./generated/client/client";
import { requestIdMiddleware } from "./middleware/requestId.middleware";
import {
  requestLoggingMiddleware,
  errorLoggingMiddleware,
} from "./middleware/requestLogging.middleware";
import { metricsMiddleware } from "./middleware/metrics.middleware";
import { corsMiddleware } from "./middleware/cors.middleware";
import { globalRateLimit, merchantRateLimit, authRateLimit } from "./middleware/rateLimit.middleware";
import merchantRoutes from "./routes/merchant.route";
import settlementRoutes from "./routes/settlement.route";
import kycRoutes from "./routes/kyc.route";
import webhookRoutes from "./routes/webhook.route";
import paymentRoutes from "./routes/payment.route";
import invoiceRoutes from "./routes/invoice.route";
import customerRoutes from "./routes/customer.route";
import refundRoutes from "./routes/refund.route";
import reconciliationRoutes from "./routes/reconciliation.route";
import sweepRoutes from "./routes/sweep.route";
import keysRoutes from "./routes/keys.route";
import settlementBatchRoutes from "./routes/settlementBatch.route";
import dashboardRoutes from "./routes/dashboard.route";
import auditRoutes from "./routes/audit.route";
import merchantDeletionRoutes from "./routes/merchantDeletion.route";
import dataExportRoutes from "./routes/dataExport.route";
import oracleRoutes from "./routes/oracle.route";

const app = express();
const prisma = new PrismaClient();

// Observability Middleware (must be first)
app.use(requestIdMiddleware);
app.use(requestLoggingMiddleware);
app.use(metricsMiddleware);

// CORS Middleware (before routes, after observability)
app.use(corsMiddleware);
app.use(express.json());

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: process.env.NODE_ENV === "production",
  }),
);

app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1") || req.path === "/health") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
  }
  next();
});

// Per-IP cap for all /api/v1 traffic (see PUBLIC_API_IP_RATE_MAX). Authenticated
// routes also use merchantApiKeyRateLimit in route files.
app.use("/api/v1", globalRateLimit());

// Swagger UI
app.use(
  "/api-docs",
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  }),
  swaggerUi.serve,
  swaggerUi.setup(specs),
);

app.use("/api/v1/merchants", merchantRoutes);
app.use("/api/v1/settlements", settlementRoutes);
app.use("/api/v1/merchants/kyc", kycRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/invoices", invoiceRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/refunds", refundRoutes);
app.use("/api/v1/keys", keysRoutes);
app.use("/api/v1/dashboard", merchantRateLimit(), dashboardRoutes);
app.use("/api/v1/admin/reconciliation", reconciliationRoutes);
app.use("/api/v1/admin/settlement", settlementBatchRoutes);
app.use("/api/v1/admin/sweep", sweepRoutes);
app.use("/api/v1/admin", auditRoutes);
app.use("/api/v1/merchants", merchantDeletionRoutes);
app.use("/api/v1/merchants/export", dataExportRoutes);
app.use("/api/v1", oracleRoutes);

// Basic health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Error logging middleware (must be last)
app.use(errorLoggingMiddleware);

// Example route
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Check if the server is running
 *     responses:
 *       200:
 *         description: Server is up
 */

export { app, prisma };
