import { describe, expect, it, vi } from 'vitest';
import { createRefreshQueue } from './refreshQueue';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createRefreshQueue', () => {
  it('shares one in-flight refresh across concurrent callers', async () => {
    const d = deferred<string | null>();
    const doRefresh = vi.fn(() => d.promise);
    const refresh = createRefreshQueue(doRefresh);

    const p1 = refresh();
    const p2 = refresh();
    const p3 = refresh();
    expect(doRefresh).toHaveBeenCalledTimes(1);
    expect(p2).toBe(p1);
    expect(p3).toBe(p1);

    d.resolve('new-access-token');
    await expect(p1).resolves.toBe('new-access-token');
    await expect(p2).resolves.toBe('new-access-token');
  });

  it('starts a fresh attempt after the previous one settles', async () => {
    const doRefresh = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const refresh = createRefreshQueue(doRefresh);

    await expect(refresh()).resolves.toBe('first');
    await expect(refresh()).resolves.toBe('second');
    expect(doRefresh).toHaveBeenCalledTimes(2);
  });

  it('propagates failure to all waiters and resets for retry', async () => {
    const d = deferred<string | null>();
    const doRefresh = vi.fn(() => d.promise);
    const refresh = createRefreshQueue(doRefresh);

    const p1 = refresh();
    const p2 = refresh();
    d.reject(new Error('network down'));
    await expect(p1).rejects.toThrow('network down');
    await expect(p2).rejects.toThrow('network down');

    doRefresh.mockResolvedValueOnce('recovered');
    await expect(refresh()).resolves.toBe('recovered');
    expect(doRefresh).toHaveBeenCalledTimes(2);
  });

  it('lets a null result (no/invalid refresh token) through to every caller', async () => {
    const doRefresh = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);
    const refresh = createRefreshQueue(doRefresh);

    const [a, b] = await Promise.all([refresh(), refresh()]);
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(doRefresh).toHaveBeenCalledTimes(1);
  });
});
