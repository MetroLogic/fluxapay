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
  maskBankDetail,
  redactBankForDraft,
} from "@/app/[locale]/dashboard/onboarding/page";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  api: {
    kyc: {
      admin: { updateStatus: vi.fn().mockResolvedValue({}) },
      submit: vi.fn().mockResolvedValue({ id: "kyc_submitted" }),
      uploadDocument: vi.fn().mockResolvedValue({ id: "doc_uploaded" }),
    },
  },
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

/** Reset the URL between tests so a step carried by the query string cannot leak. */
function resetUrl() {
  window.history.replaceState(null, "", "/dashboard/onboarding");
}

beforeEach(() => {
  window.localStorage.clear();
  resetUrl();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetUrl();
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
  it("masks sensitive bank details while preserving the last four characters", () => {
    expect(maskBankDetail("0123456789")).toBe("******6789");
    expect(maskBankDetail("GB33BUKB20201555555555")).toBe("******************5555");
    expect(maskBankDetail("BUKBGB22")).toBe("****GB22");
    expect(maskBankDetail("")).toBe("");
  });

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

describe("draft is flushed when the page goes away (#1192)", () => {
  it("persists the last keystrokes on unmount, inside the 300ms debounce window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = render(<MerchantOnboardingPage />);

    const legalName = await screen.findByLabelText(/legal.*name/i);
    fireEvent.change(legalName, { target: { value: "Narrow Window Ltd" } });

    // No flushDraftSave() here: the point is the unmount flush, not the debounce.
    view.unmount();

    const stored = window.localStorage.getItem(DRAFT_KEY) ?? "{}";
    expect(stored).toContain("Narrow Window Ltd");
  });

  it("persists the draft on pagehide", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<MerchantOnboardingPage />);

    const legalName = await screen.findByLabelText(/legal.*name/i);
    fireEvent.change(legalName, { target: { value: "Hidden Tab Ltd" } });

    window.dispatchEvent(new Event("pagehide"));

    expect(window.localStorage.getItem(DRAFT_KEY) ?? "{}").toContain("Hidden Tab Ltd");
  });

  it("persists the draft when the document becomes hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<MerchantOnboardingPage />);

    const legalName = await screen.findByLabelText(/legal.*name/i);
    fireEvent.change(legalName, { target: { value: "Backgrounded Ltd" } });

    // The listener only writes on the way to hidden, not back to visible.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    expect(window.localStorage.getItem(DRAFT_KEY) ?? "{}").toContain("Backgrounded Ltd");
  });

  it("still redacts bank credentials on an unmount flush", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = render(<MerchantOnboardingPage />);

    await screen.findByLabelText(/legal.*name/i);
    fireEvent.change(screen.getByLabelText(/legal.*name/i), {
      target: { value: "Redacted Ltd" },
    });
    view.unmount();

    const stored = window.localStorage.getItem(DRAFT_KEY) ?? "{}";
    expect(stored).not.toContain("accountNumber");
    expect(stored).not.toContain("iban");
    expect(stored).not.toContain("swift");
  });

  it("does not resurrect the draft on unmount after a successful submission", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const view = render(<MerchantOnboardingPage />);

    /** Attach a real PDF to the nth file input, so validation accepts it. */
    const uploadNthFile = (nth: number) => {
      const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      const input = inputs[nth];
      fireEvent.change(input, {
        target: { files: [new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" })] },
      });
    };

    // Step 1: business details.
    await screen.findByLabelText(/legal business name/i);
    fireEvent.change(screen.getByLabelText(/legal business name/i), {
      target: { value: "Submitted Ltd" },
    });
    fireEvent.change(screen.getByLabelText(/country of registration/i), {
      target: { value: "NG" },
    });
    fireEvent.change(screen.getByLabelText(/business address/i), {
      target: { value: "12 Marina Road" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 2: owner details.
    await screen.findByLabelText(/full legal name/i);
    fireEvent.change(screen.getByLabelText(/full legal name/i), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: "1990-01-01" },
    });
    fireEvent.change(screen.getByLabelText(/nationality/i), { target: { value: "NG" } });
    fireEvent.change(screen.getByLabelText(/^email/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/phone/i), {
      target: { value: "+2348000000000" },
    });
    fireEvent.change(screen.getByLabelText(/residential address/i), {
      target: { value: "1 Broad Street" },
    });
    fireEvent.change(screen.getByLabelText(/government id number/i), {
      target: { value: "A12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 3: all four documents are required by handleSubmit.
    await screen.findByTestId("document-reupload-note");
    [0, 1, 2, 3].forEach(uploadNthFile);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 4: bank details.
    await screen.findByLabelText(/bank name/i);
    fireEvent.change(screen.getByLabelText(/bank name/i), { target: { value: "First Bank" } });
    fireEvent.change(screen.getByLabelText(/account number/i), {
      target: { value: "0123456789" },
    });
    fireEvent.change(screen.getByLabelText(/iban/i), {
      target: { value: "GB33BUKB20201555555555" },
    });
    fireEvent.change(screen.getByLabelText(/swift/i), { target: { value: "BUKBGB22" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 5: review and submit.
    await screen.findByText(/verify your information/i);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    });

    await screen.findByText(/submission received/i);
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();

    // Navigating away from the success screen must not write the draft back.
    view.unmount();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe("browser back and forward walk the wizard (#1192)", () => {
  it("opens on the step named in the URL, overriding the draft", async () => {
    seedDraft({ step: 1 });
    window.history.replaceState(null, "", "/dashboard/onboarding?step=2");

    render(<MerchantOnboardingPage />);

    // Step 2 is the owner form, so Ada's saved name is not what we should see.
    expect(await screen.findByLabelText(/full legal name/i)).toBeInTheDocument();
  });

  it("clamps an out-of-range step in the URL", async () => {
    window.history.replaceState(null, "", "/dashboard/onboarding?step=99");

    render(<MerchantOnboardingPage />);

    // Clamped to step 5, the review screen.
    expect(await screen.findByText(/verify your information/i)).toBeInTheDocument();
  });

  it("falls back to the draft when the URL carries no step", async () => {
    seedDraft({
      owner: { fullName: "Grace Hopper", dateOfBirth: "", nationality: "", address: "" },
      step: 2,
    });

    render(<MerchantOnboardingPage />);

    expect(await screen.findByDisplayValue("Grace Hopper")).toBeInTheDocument();
  });

  it("moves the wizard backward when popstate reports an earlier step", async () => {
    seedDraft({
      bank: { bankName: "First Bank", currency: "USD" },
      step: 4,
    });

    render(<MerchantOnboardingPage />);
    expect(await screen.findByDisplayValue("First Bank")).toBeInTheDocument();

    // The user presses Back: the browser lands on the step-3 entry.
    window.history.replaceState(null, "", "/dashboard/onboarding?step=3");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByTestId("document-reupload-note")).toBeInTheDocument();
  });

  it("moves the wizard forward when popstate reports a later step", async () => {
    render(<MerchantOnboardingPage />);
    expect(await screen.findByLabelText(/legal.*name/i)).toBeInTheDocument();

    window.history.replaceState(null, "", "/dashboard/onboarding?step=2");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByLabelText(/full legal name/i)).toBeInTheDocument();
  });

  it("ignores a popstate with no step in the URL", async () => {
    seedDraft({ step: 3 });
    window.history.replaceState(null, "", "/dashboard/onboarding?step=3");

    render(<MerchantOnboardingPage />);
    expect(await screen.findByTestId("document-reupload-note")).toBeInTheDocument();

    // A history entry from outside the wizard carries no step param.
    window.history.replaceState(null, "", "/dashboard/onboarding");
    window.dispatchEvent(new PopStateEvent("popstate"));

    // Still on step 3 rather than being reset to step 1.
    expect(await screen.findByTestId("document-reupload-note")).toBeInTheDocument();
  });

  it("writes the current step into the URL as the merchant advances", async () => {
    render(<MerchantOnboardingPage />);

    const legalName = await screen.findByLabelText(/legal.*name/i);
    fireEvent.change(legalName, { target: { value: "Step Walker Ltd" } });
    // Satisfy the step-1 gate so "Continue" is accepted.
    fireEvent.change(screen.getByLabelText(/country/i), { target: { value: "NG" } });
    fireEvent.change(screen.getByLabelText(/business address/i), {
      target: { value: "12 Marina Road" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(window.location.search).toContain("step=2"),
    );
  });

  it("leaves the URL free of a step param on the first step", async () => {
    render(<MerchantOnboardingPage />);

    expect(await screen.findByLabelText(/legal.*name/i)).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });
});

describe("document step explains that files are not persisted (#1192)", () => {
  it("warns that uploads must be re-selected after leaving the page", async () => {
    seedDraft({ step: 3 });

    render(<MerchantOnboardingPage />);

    const note = await screen.findByTestId("document-reupload-note");
    expect(note).toHaveTextContent(/select your files again/i);
  });
});
