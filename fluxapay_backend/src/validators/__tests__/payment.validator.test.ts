/**
 * Tests for payment.validator — Issue #443
 * Validates https URL enforcement, max-length constraints, and description limits.
 */

import express, { Request, Response } from "express";
import request from "supertest";
import { validate } from "../../middleware/validation.middleware";
import { createPaymentSchema } from "../../schemas/payment.schema";

// Minimal Express app that runs the validator chain then returns errors or 200.
function makeApp() {
  const app = express();
  app.use(express.json());
  app.post(
    "/payments",
    validate(createPaymentSchema),
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
        expect.objectContaining({ field: "success_url" }),
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
        expect.objectContaining({ field: "cancel_url" }),
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
        expect.objectContaining({ field: "success_url" }),
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
        expect.objectContaining({ field: "success_url" }),
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
        expect.objectContaining({ field: "cancel_url" }),
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
        expect.objectContaining({ field: "description" }),
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

describe("createPaymentSchema — metadata validation", () => {
  const app = makeApp();

  it("accepts an optional JSON metadata object", async () => {
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      metadata: {
        order_id: "order-123",
        customer: { reference: 42, tags: ["priority", "online"] },
        opted_in: true,
        note: null,
      },
    });
    expect(res.status).toBe(200);
  });

  it.each(["not-an-object", [], null])("rejects metadata with invalid top-level type %p", async (metadata) => {
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      metadata,
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-JSON metadata values", () => {
    const result = createPaymentSchema.safeParse({
      ...VALID_BODY,
      metadata: { value: BigInt(1) },
    });
    expect(result.success).toBe(false);
  });

  it("rejects metadata beyond the configured nesting depth", async () => {
    const metadata = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: "value",
            },
          },
        },
      },
    };
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      metadata,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "metadata",
          message: expect.stringContaining("depth exceeds maximum"),
        }),
      ]),
    );
  });

  it("accepts metadata exactly at the 2 KB JSON-encoded size limit", async () => {
    const overhead = Buffer.byteLength(JSON.stringify({ value: "" }), "utf8");
    const metadata = { value: "x".repeat(2048 - overhead) };
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      metadata,
    });
    expect(res.status).toBe(200);
  });

  it("rejects metadata exceeding the 2 KB JSON-encoded size limit", async () => {
    const metadata = { value: "x".repeat(2048) };
    const res = await request(app).post("/payments").send({
      ...VALID_BODY,
      metadata,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "metadata",
          message: expect.stringContaining("2048 bytes"),
        }),
      ]),
    );
  });
});
