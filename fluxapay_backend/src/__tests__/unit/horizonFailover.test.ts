/**
 * Horizon failover client (#1257): endpoint parsing, failover on transport
 * errors, circuit breaking, and recovery via health checks.
 */

jest.mock("../../utils/logger", () => ({
  getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  getMetricsCollector: () => ({ increment: jest.fn(), gauge: jest.fn(), histogram: jest.fn() }),
}));

import {
  HorizonFailoverClient,
  HorizonUnavailableError,
  isFailoverError,
  parseHorizonUrls,
} from "../../services/horizonFailover.service";

type FakeServer = { name: string; loadAccount: jest.Mock };

function fakeServer(name: string): FakeServer {
  return { name, loadAccount: jest.fn() };
}

function httpError(status: number, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { response: { status } });
}

function networkError(code = "ECONNREFUSED") {
  return Object.assign(new Error(`connect ${code}`), { code });
}

function build(
  servers: FakeServer[],
  opts: { now?: () => number; probe?: jest.Mock; failureThreshold?: number; cooldownMs?: number } = {},
) {
  const urls = servers.map((s, i) => `https://horizon-${i}.example`);
  return new HorizonFailoverClient(urls, {
    servers: servers as never,
    failureThreshold: opts.failureThreshold ?? 2,
    cooldownMs: opts.cooldownMs ?? 30_000,
    now: opts.now,
    probe: opts.probe,
  });
}

const loadAccount = (id: string) => (server: unknown) => (server as FakeServer).loadAccount(id);

describe("parseHorizonUrls", () => {
  it("reads comma-separated STELLAR_HORIZON_URLS in priority order", () => {
    expect(
      parseHorizonUrls({
        STELLAR_HORIZON_URLS: " https://a.example/ , https://b.example,,https://a.example ",
        STELLAR_HORIZON_URL: "https://ignored.example",
      } as NodeJS.ProcessEnv),
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  it("falls back to STELLAR_HORIZON_URL, then the public testnet", () => {
    expect(parseHorizonUrls({ STELLAR_HORIZON_URL: "https://one.example" } as NodeJS.ProcessEnv)).toEqual([
      "https://one.example",
    ]);
    expect(parseHorizonUrls({} as NodeJS.ProcessEnv)).toEqual(["https://horizon-testnet.stellar.org"]);
  });

  it("drops invalid entries", () => {
    expect(
      parseHorizonUrls({ STELLAR_HORIZON_URLS: "not a url, ftp://x.example, https://ok.example" } as NodeJS.ProcessEnv),
    ).toEqual(["https://ok.example"]);
  });
});

describe("isFailoverError", () => {
  it.each([
    [httpError(500), true],
    [httpError(503), true],
    [httpError(429), true],
    [networkError("ECONNREFUSED"), true],
    [networkError("ETIMEDOUT"), true],
    [Object.assign(new Error("aborted"), { name: "AbortError" }), true],
    [new Error("timeout of 10000ms exceeded"), true],
    [httpError(404), false],
    [httpError(400, "tx_failed"), false],
    [new Error("bad input"), false],
  ])("%p → %p", (error, expected) => {
    expect(isFailoverError(error)).toBe(expected);
  });
});

describe("HorizonFailoverClient", () => {
  it("uses the primary while it is healthy", async () => {
    const [primary, backup] = [fakeServer("primary"), fakeServer("backup")];
    primary.loadAccount.mockResolvedValue({ id: "G1", from: "primary" });
    const client = build([primary, backup]);

    await expect(client.call(loadAccount("G1"))).resolves.toEqual({ id: "G1", from: "primary" });
    expect(backup.loadAccount).not.toHaveBeenCalled();
  });

  it("fails over to the backup when the primary times out or returns 5xx", async () => {
    const [primary, backup] = [fakeServer("primary"), fakeServer("backup")];
    primary.loadAccount.mockRejectedValueOnce(networkError("ETIMEDOUT")).mockRejectedValueOnce(httpError(502));
    backup.loadAccount.mockResolvedValue({ id: "G1", from: "backup" });
    const client = build([primary, backup], { failureThreshold: 5 });

    await expect(client.call(loadAccount("G1"))).resolves.toMatchObject({ from: "backup" });
    await expect(client.call(loadAccount("G1"))).resolves.toMatchObject({ from: "backup" });
    expect(primary.loadAccount).toHaveBeenCalledTimes(2);
    expect(client.getStatus()[0]).toMatchObject({ state: "closed", consecutiveFailures: 2, totalFailures: 2 });
  });

  it("does not fail over on a genuine Horizon answer such as 404", async () => {
    const [primary, backup] = [fakeServer("primary"), fakeServer("backup")];
    const notFound = httpError(404, "Not Found");
    primary.loadAccount.mockRejectedValue(notFound);
    const client = build([primary, backup]);

    await expect(client.call(loadAccount("G404"))).rejects.toBe(notFound);
    expect(backup.loadAccount).not.toHaveBeenCalled();
    expect(client.getStatus()[0].state).toBe("closed");
  });

  it("opens the primary's circuit after repeated failures and skips it", async () => {
    let now = 1_000;
    const [primary, backup] = [fakeServer("primary"), fakeServer("backup")];
    primary.loadAccount.mockRejectedValue(httpError(503));
    backup.loadAccount.mockResolvedValue({ from: "backup" });
    const client = build([primary, backup], { failureThreshold: 2, now: () => now });

    await client.call(loadAccount("G1"));
    await client.call(loadAccount("G1"));
    expect(client.getStatus()[0].state).toBe("open");

    primary.loadAccount.mockClear();
    await client.call(loadAccount("G1"));
    expect(primary.loadAccount).not.toHaveBeenCalled();

    // After the cooldown the primary gets a half-open trial; success closes it.
    now += 30_000;
    primary.loadAccount.mockResolvedValueOnce({ from: "primary" });
    await expect(client.call(loadAccount("G1"))).resolves.toMatchObject({ from: "primary" });
    expect(client.getStatus()[0]).toMatchObject({ state: "closed", consecutiveFailures: 0 });
  });

  it("re-opens immediately when the half-open trial fails", async () => {
    let now = 0;
    const [primary, backup] = [fakeServer("primary"), fakeServer("backup")];
    primary.loadAccount.mockRejectedValue(networkError());
    backup.loadAccount.mockResolvedValue({ from: "backup" });
    const client = build([primary, backup], { failureThreshold: 1, now: () => now });

    await client.call(loadAccount("G1"));
    now += 30_000;
    await client.call(loadAccount("G1"));
    expect(client.getStatus()[0].state).toBe("open");
    expect(client.getStatus()[0].openedAt).toBe(new Date(30_000).toISOString());
  });

  it("restores the primary through background health checks", async () => {
    const probe = jest.fn().mockResolvedValue(false);
    const [primary, backup] = [fakeServer("primary"), fakeServer("backup")];
    primary.loadAccount.mockRejectedValue(httpError(500));
    backup.loadAccount.mockResolvedValue({ from: "backup" });
    const client = build([primary, backup], { failureThreshold: 1, probe });

    await client.call(loadAccount("G1"));
    expect(client.getStatus()[0].state).toBe("open");

    await client.runHealthChecks();
    expect(probe).toHaveBeenCalledWith("https://horizon-0.example", expect.any(Number));
    expect(client.getStatus()[0].state).toBe("open");

    probe.mockResolvedValue(true);
    const status = await client.runHealthChecks();
    expect(status[0].state).toBe("closed");
    expect(status[0].lastHealthCheckAt).not.toBeNull();
  });

  it("throws HorizonUnavailableError when every endpoint fails", async () => {
    const [primary, backup] = [fakeServer("primary"), fakeServer("backup")];
    primary.loadAccount.mockRejectedValue(httpError(503));
    backup.loadAccount.mockRejectedValue(networkError());
    const client = build([primary, backup]);

    const error = await client.call(loadAccount("G1"), "loadAccount").catch((e) => e);
    expect(error).toBeInstanceOf(HorizonUnavailableError);
    expect((error as HorizonUnavailableError).attempts).toHaveLength(2);
  });

  it("is a transparent pass-through with one endpoint (original error rethrown)", async () => {
    const only = fakeServer("only");
    const boom = httpError(503);
    only.loadAccount.mockRejectedValue(boom);
    const client = build([only]);

    await expect(client.call(loadAccount("G1"))).rejects.toBe(boom);
    expect(client.primary).toBe(only);
  });
});
