import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { specs } from "./docs/swagger";
import { PrismaClient } from "./generated/client/client";
import merchantRoutes from "./routes/merchant.route";
indempotency-rate-limiting
import paymentRoutes from "./routes/payment.route";
import dashboardRoutes from "./routes/dashboard.route";
import settlementRoutes from "./routes/settlement.route";
import kycRoutes from "./routes/kyc.route";
import webhookRoutes from "./routes/webhook.route";
import reconciliationRoutes from "./routes/reconciliation.route";
import settlementBatchRoutes from "./routes/settlementBatch.route";
import paymentRoutes from "./routes/payment.route";
import keysRoutes from "./routes/keys.route";
import refundRoutes from "./routes/refund.route";
import invoiceRoutes from "./routes/invoice.route";
import auditRoutes from "./routes/audit.route";
import sweepRoutes from "./routes/sweep.route";
main

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// API Routes
app.use("/api/merchants", merchantRoutes);
indempotency-rate-limiting
app.use("/api/payments", paymentRoutes);
app.use("/api/v1/merchants", merchantRoutes); // Alias for frontend consistency
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/settlements", settlementRoutes);
app.use("/api/merchants/kyc", kycRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/reconciliation", reconciliationRoutes);
app.use("/api/admin/settlement", settlementBatchRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/v1/payments", paymentRoutes); // Standard API path
app.use("/api/v1/keys", keysRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/admin", auditRoutes);
app.use("/api/admin/sweep", sweepRoutes);
main

// Basic health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Readiness probe – checks DB connectivity (and optionally Horizon)
app.get("/ready", async (req, res) => {
  const checks: Record<string, string> = {};

  // 1. Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch (err) {
    checks.db = "unreachable";
  }

  // 2. Optional Stellar Horizon check
  const horizonUrl = process.env.STELLAR_HORIZON_URL || process.env.HORIZON_URL;
  if (horizonUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const horizonRes = await fetch(`${horizonUrl}`, { signal: controller.signal });
      clearTimeout(timeout);
      checks.horizon = horizonRes.ok ? "ok" : "degraded";
    } catch {
      checks.horizon = "unreachable";
    }
  }

  const isReady = Object.values(checks).every((v) => v === "ok");

  res.status(isReady ? 200 : 503).json({
    status: isReady ? "ready" : "not_ready",
    timestamp: new Date(),
    checks,
  });
});

export { app, prisma };