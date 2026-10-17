import { isProhibitedIp, isProhibitedHostname, assertSafeWebhookUrl } from "./webhookUrlSsrf.util";

describe("webhook SSRF validation", () => {
  it.each(["127.0.0.1", "127.8.8.8", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1"])(
    "blocks %s", (ip) => expect(isProhibitedIp(ip)).toBe(true));

  it.each(["8.8.8.8", "172.32.0.1", "93.184.216.34", "2606:4700::1111"])(
    "allows %s", (ip) => expect(isProhibitedIp(ip)).toBe(false));

  it("blocks internal hostnames", () => {
    expect(isProhibitedHostname("localhost")).toBe(true);
    expect(isProhibitedHostname("metadata.google.internal")).toBe(true);
    expect(isProhibitedHostname("db")).toBe(true);
    expect(isProhibitedHostname("example.com")).toBe(false);
  });

  const prev = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = prev; });

  it("rejects http, bad DNS results, accepts public https", async () => {
    process.env.NODE_ENV = "production";
    await expect(assertSafeWebhookUrl("http://example.com/h", async () => ["8.8.8.8"])).rejects.toBeDefined();
    await expect(assertSafeWebhookUrl("https://evil.com/h", async () => ["169.254.169.254"])).rejects.toBeDefined();
    await expect(assertSafeWebhookUrl("https://example.com/h", async () => ["93.184.216.34"])).resolves.toBeUndefined();
  });

  it("bypasses in development", async () => {
    process.env.NODE_ENV = "development";
    await expect(assertSafeWebhookUrl("http://localhost:3000/h")).resolves.toBeUndefined();
  });
});
