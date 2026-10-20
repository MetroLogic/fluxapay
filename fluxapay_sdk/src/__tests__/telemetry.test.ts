import { fetchWithTelemetry, FluxaPayTimeoutError } from '../telemetry';

describe('fetchWithTelemetry', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws FluxaPayTimeoutError on slow responses', async () => {
    (global as any).fetch = jest.fn(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal!.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    const p = fetchWithTelemetry('http://x/y', { method: 'GET' }, { timeoutMs: 20 });
    await expect(p).rejects.toBeInstanceOf(FluxaPayTimeoutError);
    await expect(p).rejects.toMatchObject({ url: 'http://x/y', timeoutMs: 20 });
  });

  it('calls hooks on success', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: true }) as Response);
    const onRequest = jest.fn();
    const onResponse = jest.fn();
    await fetchWithTelemetry('http://x', { method: 'POST' }, { onRequest, onResponse });
    expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://x', method: 'POST' }));
    expect(onResponse).toHaveBeenCalledWith(expect.anything(), expect.any(Number));
  });
});
