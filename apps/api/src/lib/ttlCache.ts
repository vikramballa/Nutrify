/**
 * A tiny in-process cache: entries expire after `ttlMs`, and the oldest entry
 * is dropped once `maxEntries` is reached, so memory stays bounded.
 *
 * ponytail: process-local. Correct while the API runs as one instance; with
 * several, a delete on one would not reach the others' caches — move to Redis
 * (or drop the TTL to a few seconds) before scaling out.
 */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: K): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: K, value: V): void {
    // Re-inserting moves the key to the end, so the first key is the oldest.
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expires: this.now() + this.ttlMs });
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /** Cached value, or load it once and cache it. */
  async getOrLoad(key: K, load: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await load();
    this.set(key, value);
    return value;
  }
}
