import request from "supertest";
import { app } from "../app";
import Redis from "ioredis";

jest.mock("ioredis");

describe("Password rate limit integration", () => {
  it("returns 429 after forgot-password threshold exceeded per IP/email", async () => {
    const agent = request(app);
    const payload = { email: "victim@example.com" };

    // Perform 6 requests (limit is 5)
    for (let i = 0; i < 5; i++) {
      const res = await agent.post("/api/v1/forgot-password").send(payload);
      expect(res.status).not.toBe(429);
    }

    const res6 = await agent.post("/api/v1/forgot-password").send(payload);
    expect(res6.status).toBe(429);
    expect(res6.headers["retry-after"]).toBeDefined();
  });

  it("returns 429 after reset-password threshold exceeded per IP", async () => {
    const agent = request(app);

    for (let i = 0; i < 10; i++) {
      const res = await agent.post("/api/v1/reset-password").send({ token: "t", password: "Password123!" });
      expect(res.status).not.toBe(429);
    }

    const res11 = await agent.post("/api/v1/reset-password").send({ token: "t", password: "Password123!" });
    expect(res11.status).toBe(429);
    expect(res11.headers["retry-after"]).toBeDefined();
  });
});
