import {
  renderPaymentReceipt,
  resolveLocaleChain,
  pickLocaleFromAcceptLanguage,
} from "../templates/paymentReceipt.renderer";

const data = {
  name: "Ana",
  amount: "10",
  currency: "USDC",
  paymentId: "pay_1",
  explorerLink: "https://stellar.expert/x",
  timestamp: "2026-01-01T00:00:00Z",
};

describe("payment receipt renderer", () => {
  it("renders the requested locale", () => {
    const r = renderPaymentReceipt(data, "es");
    expect(r.locale).toBe("es");
    expect(r.subject).toBe("Pago confirmado - 10 USDC");
  });

  it("falls back from a regional tag to its base language", () => {
    expect(renderPaymentReceipt(data, "pt-BR").locale).toBe("pt");
    expect(resolveLocaleChain("fr-CA")).toEqual(["fr", "en"]);
  });

  it("falls back to English for unsupported or missing locales", () => {
    expect(renderPaymentReceipt(data, "xx").subject).toBe("Payment Confirmed - 10 USDC");
    expect(renderPaymentReceipt(data).locale).toBe("en");
  });

  it("picks a supported locale from Accept-Language by quality", () => {
    expect(pickLocaleFromAcceptLanguage("it;q=0.9, de;q=0.8, en;q=0.1")).toBe("de");
    expect(pickLocaleFromAcceptLanguage("it")).toBeUndefined();
  });
});
