import { closeRedisClient } from "../redisClose.util";

function makeClient(status: string, quit: () => Promise<unknown> = () => Promise.resolve("OK")) {
  return { status, quit: jest.fn(quit), disconnect: jest.fn() } as any;
}

describe("closeRedisClient", () => {
  it("is a no-op for a missing client", async () => {
    await expect(closeRedisClient(null)).resolves.toBeUndefined();
  });

  it("is a no-op for an already-ended client", async () => {
    const client = makeClient("end");
    await closeRedisClient(client);
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects a lazy client that never connected without sending QUIT", async () => {
    const client = makeClient("wait");
    await closeRedisClient(client);
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("sends QUIT to a connected client", async () => {
    const client = makeClient("ready");
    await closeRedisClient(client);
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("falls back to disconnect when QUIT fails", async () => {
    const client = makeClient("reconnecting", () => Promise.reject(new Error("offline")));
    await closeRedisClient(client);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("falls back to disconnect when QUIT hangs past the timeout", async () => {
    const client = makeClient("ready", () => new Promise(() => {}));
    await closeRedisClient(client, 10);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});
