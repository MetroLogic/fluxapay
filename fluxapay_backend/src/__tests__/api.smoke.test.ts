/**
 * Backend API Smoke Tests
 *
 * These tests verify that the backend API is running and responding correctly.
 * They serve as a quick health check for the API endpoints.
 */

import request from "supertest";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

describe("Backend API Smoke Tests", () => {
  describe("Health Check", () => {
    it("should return healthy status", async () => {
      const response = await request(API_BASE_URL).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "ok",
      });
    });
  });

  describe("API Documentation", () => {
    it("should serve Swagger docs", async () => {
      const response = await request(API_BASE_URL).get("/api-docs/");

      expect(response.status).toBe(200);
      expect(response.text).toContain("Swagger");
    });
  });

  describe("Request ID Middleware", () => {
    it("should include x-request-id in response headers", async () => {
      const response = await request(API_BASE_URL).get("/health");

      expect(response.headers["x-request-id"]).toBeDefined();
    });
  });

  describe("Critical Routes", () => {
    const criticalRoutes = [
      { method: "get", path: "/api/v1/merchants" },
      { method: "get", path: "/api/v1/payments" },
      { method: "get", path: "/api/v1/refunds" },
      { method: "get", path: "/api/v1/dashboard" },
    ];

    criticalRoutes.forEach(({ method, path }) => {
      it(`${method.toUpperCase()} ${path} should not return 404`, async () => {
        const response = await request(API_BASE_URL)[method](path);

        // Should not return 404 (route exists)
        expect(response.status).not.toBe(404);
      });
    });
  });
});
