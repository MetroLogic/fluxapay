import { chromium } from "@playwright/test";

const baseUrl = "http://localhost:3075";
const profilePath = "/tmp/fluxapay-lighthouse-chrome";
const expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
const claims = Buffer.from(JSON.stringify({ exp: expiry })).toString("base64url");
const token = `lhci.${claims}.placeholder`;

const context = await chromium.launchPersistentContext(profilePath, {
  executablePath: "/usr/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${baseUrl}/en/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate((value) => localStorage.setItem("token", value), token);
  await context.addCookies([{ name: "token", value: token, url: baseUrl }]);
} finally {
  await context.close();
}
