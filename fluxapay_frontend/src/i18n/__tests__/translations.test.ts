import { describe, it, expect } from "vitest";
import { routing } from "@/i18n/routing";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import pt from "../../../messages/pt.json";
import es from "../../../messages/es.json";
import ar from "../../../messages/ar.json";
import sw from "../../../messages/sw.json";

const translations: Record<string, Record<string, unknown>> = {
  en,
  fr,
  pt,
  es,
  ar,
  sw,
};

function getAllKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const key in obj) {
    const value = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys = keys.concat(getAllKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe("i18n translations", () => {
  it("all configured locales have translation files", () => {
    routing.locales.forEach((locale) => {
      expect(translations[locale]).toBeDefined(
        `Translation file for locale '${locale}' is missing`
      );
    });
  });

  it("all locales have the same keys as English", () => {
    const enKeys = new Set(getAllKeys(en));

    routing.locales.forEach((locale) => {
      if (locale === "en") return;

      const localeKeys = new Set(getAllKeys(translations[locale]));
      const missingKeys = Array.from(enKeys).filter((key) => !localeKeys.has(key));
      const extraKeys = Array.from(localeKeys).filter((key) => !enKeys.has(key));

      expect(missingKeys).toEqual(
        [],
        `Locale '${locale}' is missing keys: ${missingKeys.join(", ")}`
      );
      expect(extraKeys).toEqual(
        [],
        `Locale '${locale}' has extra keys: ${extraKeys.join(", ")}`
      );
    });
  });

  it("all locales are exported", () => {
    const configuredLocales = new Set(routing.locales);
    const translatedLocales = new Set(Object.keys(translations));

    expect(configuredLocales).toEqual(translatedLocales);
  });
});
