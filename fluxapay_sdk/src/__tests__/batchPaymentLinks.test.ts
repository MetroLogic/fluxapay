import { createPaymentLinksBatch } from '../batchPaymentLinks';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createPaymentLinksBatch', () => {
  it('respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const create = async (p: { n: number }) => {
      active++;
      peak = Math.max(peak, active);
      await delay(10);
      active--;
      return { id: `l${p.n}` };
    };
    const items = Array.from({ length: 12 }, (_, n) => ({ n }));
    const res = await createPaymentLinksBatch(create, items, { concurrency: 3 });
    expect(res.successful).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('collects partial failures', async () => {
    const create = async (p: { n: number }) => {
      await delay(1);
      if (p.n % 2) throw new Error('bad');
      return { id: `l${p.n}` };
    };
    const items = [0, 1, 2, 3].map((n) => ({ n }));
    const res = await createPaymentLinksBatch(create, items);
    expect(res.successful).toHaveLength(2);
    expect(res.failed.map((f) => f.item.n)).toEqual([1, 3]);
  });

  it('stops starting new items when continueOnError is false', async () => {
    const create = jest.fn(async (p: { n: number }) => {
      if (p.n === 0) throw new Error('x');
      return { id: 'ok' };
    });
    const items = [0, 1, 2, 3].map((n) => ({ n }));
    const res = await createPaymentLinksBatch(create, items, { concurrency: 1, continueOnError: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(res.failed).toHaveLength(1);
  });
});
