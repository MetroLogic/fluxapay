import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WIDGET_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), "public/fluxapay-widget.js"),
  "utf-8",
);

const NONCE = "r4nd0m-nonce-value";

interface FluxaPayWidget {
  version: string;
  nonce: string | null;
  createNoncedElement: (tagName: string) => HTMLElement;
  checkout: (config: Record<string, unknown>) => void;
  closeModal: () => void;
}

declare global {
  // eslint-disable-next-line no-var
  var FluxaPay: FluxaPayWidget | undefined;
}

/**
 * Evaluate the widget with `document.currentScript` pointing at a tag we
 * control, which is how a merchant's page presents the nonce.
 */
function loadWidget(options: { nonce?: string | null; useCurrentScript?: boolean } = {}) {
  const { nonce = NONCE, useCurrentScript = true } = options;

  const scriptTag = document.createElement("script");
  scriptTag.src = "https://cdn.fluxapay.com/fluxapay-widget.js";
  if (nonce !== null) scriptTag.setAttribute("data-nonce", nonce);
  document.head.appendChild(scriptTag);

  Object.defineProperty(document, "currentScript", {
    configurable: true,
    get: () => (useCurrentScript ? scriptTag : null),
  });

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(WIDGET_SOURCE)();

  return scriptTag;
}

function styleElement() {
  return document.getElementById("fluxapay-widget-styles") as HTMLStyleElement | null;
}

describe("checkout widget CSP nonce support", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    delete globalThis.FluxaPay;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("nonce discovery", () => {
    it("reads data-nonce from its own script tag", () => {
      loadWidget();
      expect(globalThis.FluxaPay?.nonce).toBe(NONCE);
    });

    it("falls back to a tagged script when currentScript is unavailable", () => {
      const tag = document.createElement("script");
      tag.setAttribute("data-fluxapay-widget", "");
      tag.setAttribute("data-nonce", "async-nonce");
      document.head.appendChild(tag);

      Object.defineProperty(document, "currentScript", {
        configurable: true,
        get: () => null,
      });
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(WIDGET_SOURCE)();

      expect(globalThis.FluxaPay?.nonce).toBe("async-nonce");
    });

    it("falls back to a script matched by src", () => {
      loadWidget({ useCurrentScript: false });
      expect(globalThis.FluxaPay?.nonce).toBe(NONCE);
    });

    it("falls back to the global when no tag carries a nonce", () => {
      (window as unknown as { FLUXAPAY_CSP_NONCE?: string }).FLUXAPAY_CSP_NONCE = "global-nonce";
      loadWidget({ nonce: null, useCurrentScript: false });

      expect(globalThis.FluxaPay?.nonce).toBe("global-nonce");
      delete (window as unknown as { FLUXAPAY_CSP_NONCE?: string }).FLUXAPAY_CSP_NONCE;
    });

    it("resolves to null when the host page supplies nothing", () => {
      loadWidget({ nonce: null, useCurrentScript: false });
      expect(globalThis.FluxaPay?.nonce).toBeNull();
    });
  });

  describe("injected elements", () => {
    it("injects the stylesheet with the nonce set", () => {
      loadWidget();
      globalThis.FluxaPay?.checkout({ paymentId: "pay_123", merchantName: "Acme" });

      const style = styleElement();
      expect(style).not.toBeNull();
      expect(style?.getAttribute("nonce")).toBe(NONCE);
    });

    it("injects the stylesheet only once across repeated checkouts", () => {
      loadWidget();
      globalThis.FluxaPay?.checkout({ paymentId: "pay_123" });
      globalThis.FluxaPay?.closeModal();
      globalThis.FluxaPay?.checkout({ paymentId: "pay_456" });

      expect(document.querySelectorAll("#fluxapay-widget-styles")).toHaveLength(1);
    });

    it("createNoncedElement stamps the nonce on scripts and styles", () => {
      loadWidget();

      const script = globalThis.FluxaPay?.createNoncedElement("script");
      const style = globalThis.FluxaPay?.createNoncedElement("style");

      expect(script?.getAttribute("nonce")).toBe(NONCE);
      expect(style?.getAttribute("nonce")).toBe(NONCE);
    });

    it("omits the nonce attribute entirely when there is none to apply", () => {
      loadWidget({ nonce: null, useCurrentScript: false });
      globalThis.FluxaPay?.checkout({ paymentId: "pay_123" });

      expect(styleElement()?.hasAttribute("nonce")).toBe(false);
    });
  });

  describe("no inline style attributes", () => {
    it("the widget source sets no inline styles", () => {
      // A nonce cannot whitelist a style *attribute* — only <style> elements —
      // so any surviving `element.style.x = ...` would render unstyled under a
      // strict style-src no matter what nonce is configured.
      const executable = WIDGET_SOURCE.split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
        .join("\n");

      expect(executable).not.toContain("style.cssText");
      expect(executable).not.toMatch(/\.style\.[a-zA-Z]+\s*=/);
    });

    it("renders the modal with class names rather than style attributes", () => {
      loadWidget();
      globalThis.FluxaPay?.checkout({ paymentId: "pay_123", merchantName: "Acme" });

      const overlay = document.getElementById("fluxapay-modal-overlay");
      expect(overlay).not.toBeNull();
      expect(overlay?.className).toBe("fluxapay-modal-overlay");
      expect(overlay?.getAttribute("style")).toBeNull();

      const modal = document.getElementById("fluxapay-modal");
      expect(modal?.className).toBe("fluxapay-modal");
      expect(modal?.getAttribute("style")).toBeNull();
    });

    it("leaves no element inside the modal carrying a style attribute", () => {
      loadWidget();
      globalThis.FluxaPay?.checkout({ paymentId: "pay_123", merchantName: "Acme" });

      const withStyle = document
        .getElementById("fluxapay-modal-overlay")
        ?.querySelectorAll("[style]");

      expect(withStyle?.length ?? 0).toBe(0);
    });

    it("renders the embedded iframe with a class, not inline styles", () => {
      const container = document.createElement("div");
      container.id = "fluxapay-checkout";
      document.body.appendChild(container);

      loadWidget();
      globalThis.FluxaPay?.checkout({ paymentId: "pay_123", mode: "embedded" });

      const iframe = container.querySelector("iframe");
      expect(iframe?.className).toBe("fluxapay-embedded-iframe");
      expect(iframe?.getAttribute("style")).toBeNull();
      expect(styleElement()?.getAttribute("nonce")).toBe(NONCE);
    });
  });
});
