import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { specs } from "./docs/swagger";
import { PrismaClient } from "./generated/client/client";
import merchantRoutes from "./routes/merchant.route";
import dashboardRoutes from './routes/dashboard.route'

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

app.use("/api/merchants", merchantRoutes);
app.use("/api/dashboard", dashboardRoutes);
// Basic health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

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
