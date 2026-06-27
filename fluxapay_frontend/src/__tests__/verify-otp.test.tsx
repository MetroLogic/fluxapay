import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VerifyOtpPage from "@/app/[locale]/verify-otp/page";
import { api, ApiError } from "@/lib/api";

jest.mock("@/lib/api");
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => {
      const params: Record<string, string> = {
        merchantId: "merchant_123",
        channel: "email",
      };
      return params[key];
    },
  }),
}));
jest.mock("react-hot-toast");

describe("OTP Verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Expired OTP handling", () => {
    it("should display expired OTP error with request new OTP CTA", async () => {
      const expiredError = new ApiError(
        "OTP has expired. Please request a new one.",
        400
      );
      expiredError.code = "OTP_EXPIRED";
      (api.auth.verifyOtp as jest.Mock).mockRejectedValue(expiredError);

      render(<VerifyOtpPage />);

      const inputs = screen.getAllByRole("textbox");
      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], "1");
      }

      await waitFor(() => {
        expect(
          screen.getByText("OTP has expired. Please request a new one.")
        ).toBeInTheDocument();
      });

      expect(screen.getByText("Request new OTP")).toBeInTheDocument();
    });

    it("should disable OTP input when expired", async () => {
      const expiredError = new ApiError("OTP has expired.", 400);
      expiredError.code = "OTP_EXPIRED";
      (api.auth.verifyOtp as jest.Mock).mockRejectedValue(expiredError);

      render(<VerifyOtpPage />);

      const inputs = screen.getAllByRole("textbox");
      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], "1");
      }

      await waitFor(() => {
        inputs.forEach((input) => {
          expect(input).toBeDisabled();
        });
      });
    });
  });

  describe("Resend cooldown", () => {
    it("should disable resend button for 60 seconds after successful resend", async () => {
      (api.auth.resendOtp as jest.Mock).mockResolvedValue({});

      render(<VerifyOtpPage />);

      const resendBtn = screen.getByText("Resend Code");
      await userEvent.click(resendBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Resend available in \d+s/)
        ).toBeInTheDocument();
      });

      expect(resendBtn).not.toBeInTheDocument();
    });

    it("should show countdown timer during cooldown", async () => {
      jest.useFakeTimers();
      (api.auth.resendOtp as jest.Mock).mockResolvedValue({});

      render(<VerifyOtpPage />);

      const resendBtn = screen.getByText("Resend Code");
      await userEvent.click(resendBtn);

      await waitFor(() => {
        expect(screen.getByText(/Resend available in \d+s/)).toBeInTheDocument();
      });

      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(screen.getByText(/Resend available in 59s/)).toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe("Rate limit handling", () => {
    it("should display 429 rate limit error with cooldown time", async () => {
      const rateLimitError = new ApiError("Too many requests", 429);
      rateLimitError.retryAfterSeconds = 30;
      (api.auth.verifyOtp as jest.Mock).mockRejectedValue(rateLimitError);

      render(<VerifyOtpPage />);

      const inputs = screen.getAllByRole("textbox");
      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], "1");
      }

      await waitFor(() => {
        expect(
          screen.getByText("Too many attempts. Please try again in 30 seconds.")
        ).toBeInTheDocument();
      });

      expect(screen.getByText("Try again in 30 seconds.")).toBeInTheDocument();
    });
  });

  describe("OTP input auto-focus and auto-submit", () => {
    it("should auto-focus first input on mount", () => {
      render(<VerifyOtpPage />);

      const inputs = screen.getAllByRole("textbox");
      expect(inputs[0]).toHaveFocus();
    });

    it("should auto-submit when 6 digits are entered", async () => {
      (api.auth.verifyOtp as jest.Mock).mockResolvedValue({});

      render(<VerifyOtpPage />);

      const inputs = screen.getAllByRole("textbox");
      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], String(i + 1));
      }

      await waitFor(() => {
        expect(api.auth.verifyOtp).toHaveBeenCalledWith({
          merchantId: "merchant_123",
          channel: "email",
          otp: "123456",
        });
      });
    });
  });
});
