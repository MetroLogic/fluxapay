jest.mock("../emailSuppression.service", () => ({
  isEmailSuppressed: jest.fn(),
}));

const mockSendEmail = jest.fn().mockResolvedValue(undefined);

jest.mock("../../email/emailProvider.factory", () => ({
  getEmailProvider: jest.fn(() => ({
    sendEmail: mockSendEmail,
  })),
}));

jest.mock("../../utils/logger", () => ({
  getLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import { isEmailSuppressed } from "../emailSuppression.service";
import { sendPaymentConfirmationEmail, sendOtpEmail, sendSecurityAlertEmail, sendWelcomeEmail } from "../email.service";

const mockIsSuppressed = isEmailSuppressed as jest.Mock;

describe("email.service suppression", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BASE_URL = "http://localhost:3000";
    process.env.RESEND_API_KEY = "re_test";
  });

  it("skips send for suppressed marketing / notification addresses", async () => {
    mockIsSuppressed.mockResolvedValue(true);

    await sendPaymentConfirmationEmail("blocked@example.com", "Acme", {
      amount: "10",
      currency: "USDC",
      payment_id: "pay-1",
      explorer_link: "https://example.com",
      timestamp: new Date().toISOString(),
    });

    expect(mockSendEmail).not.toHaveBeenCalled();

    await sendWelcomeEmail("blocked@example.com", "Acme", "key_123", "http://localhost:3000");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends transactional/OTP and security emails even if suppressed, logging a warning", async () => {
    mockIsSuppressed.mockResolvedValue(true);

    await sendOtpEmail("suppressed-user@example.com", "123456");
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "suppressed-user@example.com",
        subject: "Your Fluxapay OTP",
      })
    );

    mockSendEmail.mockClear();

    await sendSecurityAlertEmail({
      to: "suppressed-user@example.com",
      subject: "Security Alert Test",
      message: "Unusual login activity detected",
    });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "suppressed-user@example.com",
        subject: "Security Alert Test",
      })
    );
  });

  it("includes unsubscribe link in merchant notification emails", async () => {
    mockIsSuppressed.mockResolvedValue(false);

    await sendPaymentConfirmationEmail("merchant@example.com", "Acme", {
      amount: "10",
      currency: "USDC",
      payment_id: "pay-1",
      explorer_link: "https://example.com",
      timestamp: new Date().toISOString(),
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("/api/v1/email/unsubscribe?email="),
      }),
    );
  });
});
