/**
 * Tests for payment.validator — Issue #443
 * Validates https URL enforcement, max-length constraints, and description limits.
 */

import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import { validatePayment } from "../payment.validator";

// Minimal Express app that runs the validator chain then returns errors or 200.
function makeApp() {
  const app = express();
  app.use(express.json());
  app.post(
    "/payments",
    ...validatePayment,
    (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    }
  );
  return app;
}

const VALID_BODY = {
  amount: 10,
  currency: "USDC",
  customer_email: "buyer@example.com",
};

describe("validatePayment — success_url / cancel_url validation (Issue #443)", () => {
  const app = makeApp();

  it("should accept a valid https success_url and cancel_url", async () => {
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      success_url: "https://merchant.com/success",
      cancel_url: "https://merchant.com/cancel",
    });
    expect(res.status).toBe(200);
  });

  it("should reject http success_url (not https)", async () => {
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      success_url: "http://merchant.com/success",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "success_url" }),
      ])
    );
  });

  it("should reject http cancel_url (not https)", async () => {
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      cancel_url: "http://merchant.com/cancel",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "cancel_url" }),
      ])
    );
  });

  it("should reject a non-URL string as success_url", async () => {
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      success_url: "not-a-url",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "success_url" }),
      ])
    );
  });

  it("should reject success_url exceeding 2048 characters", async () => {
    const longPath = "a".repeat(2040);
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      success_url: `https://merchant.com/${longPath}`,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "success_url" }),
      ])
    );
  });

  it("should reject cancel_url exceeding 2048 characters", async () => {
    const longPath = "a".repeat(2040);
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      cancel_url: `https://merchant.com/${longPath}`,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "cancel_url" }),
      ])
    );
  });

  it("should allow omitting success_url and cancel_url (optional fields)", async () => {
    const res = await request(app).post("/payments").send(VALID_BODY);
    expect(res.status).toBe(200);
  });
});

describe("validatePayment — description validation (Issue #443)", () => {
  const app = makeApp();

  it("should accept a description within 500 characters", async () => {
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      description: "Order #1234 — thank you for your purchase!",
    });
    expect(res.status).toBe(200);
  });

  it("should reject description exceeding 500 characters", async () => {
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      description: "x".repeat(501),
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "description" }),
      ])
    );
  });

  it("should accept a description of exactly 500 characters", async () => {
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      description: "y".repeat(500),
    });
    expect(res.status).toBe(200);
  });

  it("should allow omitting description (optional field)", async () => {
    const res = await request(app).post("/payments").send(VALID_BODY);
    expect(res.status).toBe(200);
  });
});
