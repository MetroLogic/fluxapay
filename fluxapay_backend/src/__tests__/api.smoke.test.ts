/**
 * Backend API Smoke Tests
 *
 * These tests verify that the backend API is running and responding correctly.
 * They serve as a quick health check for the API endpoints.
 */

import request from "supertest";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
// Skip smoke tests when no explicit server URL is provided (unit CI runs without a live server)
const describeIfServer = process.env.API_BASE_URL ? describe : describe.skip;

describeIfServer("Backend API Smoke Tests", () => {
  describe("Health Check", () => {
    it("should return healthy status", async () => {
      const response = await request(API_BASE_URL).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "ok",
      });
    });
  });

  describe("Authentication API", () => {
    it("should respond to login attempts", async () => {
      const response = await request(API_BASE_URL)
        .post("/api/v1/merchants/login")
        .send({
          email: "smoke-test@example.com",
          password: "password123",
        });

      // Expecting 400 because user doesn't exist, but it proves the route is active
      expect([400, 401]).toContain(response.status);
    });

    it("should respond to signup attempts", async () => {
      const response = await request(API_BASE_URL)
        .post("/api/v1/merchants/signup")
        .send({
          business_name: "Smoke Test Business",
          email: `smoke-${Date.now()}@example.com`,
          phone_number: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
          country: "US",
          settlement_currency: "USD",
          password: "Password123!",
        });

      // Should be 201 if successful, or 400 if validation fails/exists
      expect([201, 400]).toContain(response.status);
    });
  });

  describe("Payments API", () => {
    it("should require an API key to create a payment", async () => {
      const response = await request(API_BASE_URL)
        .post("/api/v1/payments")
        .send({
          amount: 100,
          currency: "USDC",
          customer_email: "customer@example.com",
          description: "Smoke test payment",
        });

      // Should return 401 Unauthorized since no API key is provided
      expect(response.status).toBe(401);
    });
  });

  describe("API Documentation", () => {
    it("should serve Swagger docs", async () => {
      const response = await request(API_BASE_URL).get("/api-docs/");

      expect(response.status).toBe(200);
      expect(response.text).toContain("Swagger");
    });
  });

  describe("Critical Routes Exposure", () => {
    const criticalRoutes = [
      { method: "get", path: "/api/v1/merchants/me" },
      { method: "get", path: "/api/v1/payments" },
      { method: "get", path: "/api/v1/refunds" },
      { method: "get", path: "/api/v1/dashboard" },
    ];

    criticalRoutes.forEach(({ method, path }) => {
      it(`${method.toUpperCase()} ${path} should not return 404`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (request(API_BASE_URL) as any)[method](path);

        // Should return 401 (since we are unauthenticated) but NOT 404
        expect(response.status).not.toBe(404);
      });
    });
  });
});
