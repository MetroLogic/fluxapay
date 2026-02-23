import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { specs } from "./docs/swagger";
import { PrismaClient } from "./generated/client/client";
import merchantRoutes from "./routes/merchant.route";
import settlementRoutes from "./routes/settlement.route";
import kycRoutes from "./routes/kyc.route";
import webhookRoutes from "./routes/webhook.route";
import settlementBatchRoutes from "./routes/settlementBatch.route";
import paymentRoutes from "./routes/payment.route"; // New import
import keysRoutes from "./routes/keys.route";
import refundRoutes from "./routes/refund.route";

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// API Routes
app.use("/api/merchants", merchantRoutes);
app.use("/api/settlements", settlementRoutes);
app.use("/api/merchants/kyc", kycRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/admin/settlement", settlementBatchRoutes);
app.use("/api/payments", paymentRoutes); // Added this line
app.use("/api/v1/keys", keysRoutes);
app.use("/api/refunds", refundRoutes);

// Basic health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

export { app, prisma };