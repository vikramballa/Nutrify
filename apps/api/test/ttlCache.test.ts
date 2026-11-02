import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/lib/ttlCache.js';

describe('TtlCache', () => {
  it('expires entries after the TTL', () => {
    let t = 0;
    const c = new TtlCache<string, number>(1000, 10, () => t);
    c.set('a', 1);
    t = 999;
    expect(c.get('a')).toBe(1);
    t = 1000;
    expect(c.get('a')).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it('drops the oldest entry when full', () => {
    const c = new TtlCache<string, number>(60_000, 2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('a', 11); // refreshed: now newer than b
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(11);
    expect(c.get('c')).toBe(3);
  });

  it('loads once and serves the cached value after', async () => {
    const c = new TtlCache<string, number>(60_000);
    const load = vi.fn(async () => 42);
    expect(await c.getOrLoad('k', load)).toBe(42);
    expect(await c.getOrLoad('k', load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a deleted key', async () => {
    const c = new TtlCache<string, number>(60_000);
    c.set('k', 1);
    c.delete('k');
    expect(await c.getOrLoad('k', async () => 2)).toBe(2);
  });
});
