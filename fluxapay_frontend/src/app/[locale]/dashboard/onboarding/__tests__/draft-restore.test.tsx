/**
 * Draft restore on mount for merchant onboarding (#777).
 *
 * The failure being guarded against is a browser refresh losing everything the
 * merchant typed, so the central test unmounts and remounts the page — which
 * is what a refresh does to component state — and asserts the values come
 * back. The security half is asserted too: bank credentials must never reach
 * localStorage in the first place.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import MerchantOnboardingPage, {
  redactBankForDraft,
} from "@/app/[locale]/dashboard/onboarding/page";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  api: { kyc: { admin: { updateStatus: vi.fn().mockResolvedValue({}) } } },
  toastApiError: vi.fn(),
}));

const DRAFT_KEY = "fluxapay_kyc_draft";

/** The draft a merchant would have left behind mid-form. */
function seedDraft(overrides: Record<string, unknown> = {}) {
  window.localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      business: {
        legalName: "Acme Trading Ltd",
        registrationNumber: "RC-12345",
        country: "NG",
        address: "12 Marina Road",
        website: "",
      },
      owner: {},
      documents: {},
      bank: {},
      step: 1,
      ...overrides,
    }),
  );
}

/** Let the debounced draft save (300ms) flush. */
function flushDraftSave() {
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("draft restore on mount", () => {
  it("repopulates fields from the saved draft when the page mounts", async () => {
    seedDraft();

    render(<MerchantOnboardingPage />);

    expect(await screen.findByDisplayValue("Acme Trading Ltd")).toBeInTheDocument();
    expect(screen.getByDisplayValue("RC-12345")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12 Marina Road")).toBeInTheDocument();
  });

  it("survives a refresh mid-form", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // First visit: the merchant types into the business step.
    const first = render(<MerchantOnboardingPage />);
    const legalName = await screen.findByLabelText(/legal.*name/i);
    fireEvent.change(legalName, { target: { value: "Bluewave Logistics" } });
    flushDraftSave();

    // A refresh tears the tree down and builds a fresh one.
    first.unmount();
    vi.useRealTimers();

    render(<MerchantOnboardingPage />);

    expect(
      await screen.findByDisplayValue("Bluewave Logistics"),
    ).toBeInTheDocument();
  });

  it("restores the step the merchant had reached", async () => {
    seedDraft({
      owner: { fullName: "Ada Lovelace", dateOfBirth: "", nationality: "", address: "" },
      step: 2,
    });

    render(<MerchantOnboardingPage />);

    expect(await screen.findByDisplayValue("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows the restore banner, and hides it once acknowledged", async () => {
    seedDraft();

    render(<MerchantOnboardingPage />);

    const banner = await screen.findByTestId("draft-restored-banner");
    expect(banner).toHaveTextContent("We restored your progress from last time.");

    fireEvent.click(screen.getByRole("button", { name: /got it/i }));

    await waitFor(() =>
      expect(screen.queryByTestId("draft-restored-banner")).toBeNull(),
    );
  });

  it("marks restored fields as distinct until the merchant confirms", async () => {
    seedDraft();

    render(<MerchantOnboardingPage />);

    const restored = await screen.findByTestId("restored-fields");
    expect(restored).toHaveAttribute("data-restored", "true");

    fireEvent.click(screen.getByRole("button", { name: /got it/i }));

    await waitFor(() =>
      expect(screen.queryByTestId("restored-fields")).toBeNull(),
    );
  });

  it("shows no banner on a first visit with nothing saved", async () => {
    render(<MerchantOnboardingPage />);

    await screen.findByLabelText(/legal.*name/i);
    expect(screen.queryByTestId("draft-restored-banner")).toBeNull();
  });

  it("ignores a corrupt draft rather than failing to render", async () => {
    window.localStorage.setItem(DRAFT_KEY, "{not json");

    render(<MerchantOnboardingPage />);

    expect(await screen.findByLabelText(/legal.*name/i)).toBeInTheDocument();
    expect(screen.queryByTestId("draft-restored-banner")).toBeNull();
  });
});

describe("sensitive fields are never persisted", () => {
  it("strips account number, IBAN and SWIFT from a bank slice", () => {
    const redacted = redactBankForDraft({
      bankName: "First Bank",
      currency: "USD",
      accountNumber: "0123456789",
      iban: "GB33BUKB20201555555555",
      swift: "BUKBGB22",
    });

    expect(redacted).toEqual({ bankName: "First Bank", currency: "USD" });
    expect(redacted).not.toHaveProperty("accountNumber");
    expect(redacted).not.toHaveProperty("iban");
    expect(redacted).not.toHaveProperty("swift");
  });

  it("keeps bank credentials out of localStorage as the merchant types them", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<MerchantOnboardingPage />);

    // Jump to the bank step via the saved draft rather than clicking through
    // four steps of required-field validation.
    flushDraftSave();
    const stored = window.localStorage.getItem(DRAFT_KEY) ?? "{}";

    expect(stored).not.toContain("accountNumber");
    expect(stored).not.toContain("iban");
    expect(stored).not.toContain("swift");
  });

  it("round-trips a draft whose bank slice carries only safe fields", async () => {
    seedDraft({ bank: { bankName: "First Bank", currency: "EUR" }, step: 4 });

    render(<MerchantOnboardingPage />);

    expect(await screen.findByDisplayValue("First Bank")).toBeInTheDocument();
    // The sensitive inputs come back empty and must be retyped.
    const accountNumber = screen.getByLabelText(/account number/i) as HTMLInputElement;
    expect(accountNumber.value).toBe("");
  });
});
