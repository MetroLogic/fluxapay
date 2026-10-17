import { shareOrCopyLink, canUseWebShare } from '../shareLink';

const input = { title: 'Invoice', amount: 10, currency: 'USD', url: 'https://x.test/c/1' };

describe('shareOrCopyLink', () => {
  afterEach(() => {
    delete (navigator as any).share;
    delete (navigator as any).vibrate;
  });

  it('uses navigator.share when supported', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    expect(canUseWebShare()).toBe(true);
    expect(await shareOrCopyLink(input)).toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: input.url }));
  });

  it('falls back to clipboard and vibrates', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const vibrate = jest.fn();
    Object.assign(navigator, { clipboard: { writeText }, vibrate });
    expect(await shareOrCopyLink(input)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(input.url);
    expect(vibrate).toHaveBeenCalledWith(50);
  });

  it('reports cancelled share', async () => {
    const err = Object.assign(new Error('x'), { name: 'AbortError' });
    Object.assign(navigator, { share: jest.fn().mockRejectedValue(err) });
    expect(await shareOrCopyLink(input)).toBe('cancelled');
  });
});
