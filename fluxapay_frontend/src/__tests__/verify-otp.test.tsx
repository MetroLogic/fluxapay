import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import VerifyOtpPage from "@/app/[locale]/verify-otp/page";
import { api, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      auth: {
        verifyOtp: vi.fn(),
        resendOtp: vi.fn(),
      },
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) =>
      ({ merchantId: "merchant_123", channel: "email" } as Record<string, string>)[key] ?? null,
  }),
}));
vi.mock("react-hot-toast");

async function typeOtp(digits = "111111") {
  await userEvent.click(screen.getAllByRole("textbox")[0]);
  await userEvent.keyboard(digits);
}

describe("OTP Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers(); // ensure real timers for every test
  });

  describe("Expired OTP handling", () => {
    it("should display expired OTP error with request new OTP CTA", async () => {
      const err = new ApiError(400, "OTP has expired. Please request a new one.");
      err.code = "OTP_EXPIRED";
      (api.auth.verifyOtp as ReturnType<typeof vi.fn>).mockRejectedValue(err);

      render(<VerifyOtpPage />);
      await typeOtp();

      await waitFor(() =>
        expect(screen.getByText("OTP has expired. Please request a new one.")).toBeInTheDocument()
      );
      expect(screen.getByText("Request new OTP")).toBeInTheDocument();
    });

    it("should disable OTP input when expired", async () => {
      const err = new ApiError(400, "OTP has expired.");
      err.code = "OTP_EXPIRED";
      (api.auth.verifyOtp as ReturnType<typeof vi.fn>).mockRejectedValue(err);

      render(<VerifyOtpPage />);
      await typeOtp();

      await waitFor(() =>
        screen.getAllByRole("textbox").forEach((input) => expect(input).toBeDisabled())
      );
    });
  });

  describe("Resend cooldown", () => {
    it("should disable resend button for 60 seconds after successful resend", async () => {
      (api.auth.resendOtp as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(<VerifyOtpPage />);
      await userEvent.click(screen.getByText("Resend Code"));

      await waitFor(() =>
        expect(screen.getAllByText((_, el) =>
          el?.textContent?.trim().startsWith("Resend available in") ?? false
        ).length).toBeGreaterThan(0)
      );
      expect(screen.queryByText("Resend Code")).not.toBeInTheDocument();
    });

    it("should show countdown timer during cooldown", async () => {
      vi.useFakeTimers();
      (api.auth.resendOtp as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(<VerifyOtpPage />);

      // Use fireEvent (synchronous) to avoid userEvent's internal timer dependency
      await act(async () => {
        fireEvent.click(screen.getByText("Resend Code"));
        // Flush the resolved mock promise
        await Promise.resolve();
        await Promise.resolve();
      });

      act(() => { vi.advanceTimersByTime(1000); });

      expect(
        screen.getAllByText((_, el) =>
          el?.textContent?.trim() === "Resend available in 59s" ?? false
        ).length
      ).toBeGreaterThan(0);
    });
  });

  describe("Rate limit handling", () => {
    it("should display 429 rate limit error with cooldown time", async () => {
      const err = new ApiError(429, "Too many requests");
      err.retryAfterSeconds = 30;
      (api.auth.verifyOtp as ReturnType<typeof vi.fn>).mockRejectedValue(err);

      render(<VerifyOtpPage />);
      await typeOtp();

      await waitFor(() =>
        expect(
          screen.getByText("Too many attempts. Please try again in 30 seconds.")
        ).toBeInTheDocument()
      );
      expect(screen.getByText(/Try again in 30 seconds/)).toBeInTheDocument();
    });
  });

  describe("OTP input auto-focus and auto-submit", () => {
    it("should auto-focus first input on mount", () => {
      render(<VerifyOtpPage />);
      expect(screen.getAllByRole("textbox")[0]).toHaveFocus();
    });

    it("should auto-submit when 6 digits are entered", async () => {
      (api.auth.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValue({});

      render(<VerifyOtpPage />);
      await typeOtp("123456");

      await waitFor(() =>
        expect(api.auth.verifyOtp).toHaveBeenCalledWith({
          merchantId: "merchant_123",
          channel: "email",
          otp: "123456",
        })
      );
    });
  });
});
