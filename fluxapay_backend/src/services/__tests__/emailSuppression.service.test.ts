const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    emailSuppression: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
    },
  })),
}));

jest.mock("../../utils/logger", () => ({
  getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import {
  isEmailSuppressed,
  addEmailSuppression,
  ingestBounceEvents,
} from "../emailSuppression.service";

describe("emailSuppression.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isEmailSuppressed", () => {
    it("returns true when email exists in suppression list", async () => {
      mockFindUnique.mockResolvedValue({
        email: "bounced@example.com",
      });

      await expect(isEmailSuppressed("bounced@example.com")).resolves.toBe(true);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { email: "bounced@example.com" },
      });
    });

    it("returns false when email is not suppressed", async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(isEmailSuppressed("good@example.com")).resolves.toBe(false);
    });
  });

  describe("addEmailSuppression", () => {
    it("upserts bounced address", async () => {
      await addEmailSuppression("bad@example.com", "bounce", "email.bounced");
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: "bad@example.com" },
          create: expect.objectContaining({ reason: "bounce" }),
        }),
      );
    });
  });

  describe("ingestBounceEvents", () => {
    it("ingests Resend-style bounce webhook payload", async () => {
      const count = await ingestBounceEvents({
        type: "email.bounced",
        data: { to: ["merchant@example.com"] },
      });
      expect(count).toBe(1);
      expect(mockUpsert).toHaveBeenCalled();
    });

    it("ingests SendGrid-style bounce array payload", async () => {
      const count = await ingestBounceEvents([
        { event: "bounce", email: "a@example.com" },
        { event: "complaint", email: "b@example.com" },
      ]);
      expect(count).toBe(2);
    });
  });
});
