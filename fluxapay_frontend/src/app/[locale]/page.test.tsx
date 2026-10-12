import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/landing", () => ({
  Bridges: () => null,
  FAQ: () => null,
  Footer: () => null,
  GlobalReach: () => null,
  Hero: () => null,
  UseCases: () => null,
  WhyFluxapay: () => null,
}));

import Home from "./page";

describe("Home structured data", () => {
  it("renders Organization, SoftwareApplication, and FAQPage JSON-LD", () => {
    const { container } = render(<Home />);
    const schemas = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    ).map((script) => JSON.parse(script.textContent ?? "{}"));

    expect(schemas.map((schema) => schema["@type"])).toEqual([
      "Organization",
      "SoftwareApplication",
      "FAQPage",
    ]);
    expect(schemas[2].mainEntity).toHaveLength(5);
  });
});