/**
 * lru.ts — small LRU primitives shared across main + renderer.
 *
 * Two flavors covering every existing in-process cache in the app:
 *
 *  - `LruByCount<K, V>` — keep at most `capacity` entries; evict oldest.
 *  - `LruByBytes<K, V>` — keep entries until total bytes exceed `maxBytes`;
 *     evict oldest first until back under budget. Caller supplies a `sizeOf`.
 *
 * Both use a Map's insertion order as LRU order. `get(k)` re-inserts on hit
 * to bump the entry to MRU. An optional `onEvict` callback runs once per
 * evicted entry — the existing call sites use it to revoke blob URLs and
 * close yauzl handles.
 */

interface BaseOpts<K, V> {
  onEvict?: (key: K, value: V) => void;
}

export interface LruByCountOpts<K, V> extends BaseOpts<K, V> {
  capacity: number;
}

export interface LruByBytesOpts<K, V> extends BaseOpts<K, V> {
  maxBytes: number;
  /**
   * Bytes consumed by the value. Called once per insertion; result is
   * cached internally — recomputing isn't supported, since it would
   * desync the running tally.
   */
  sizeOf: (value: V) => number;
}

export class LruByCount<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly opts: LruByCountOpts<K, V>) {}

  get size(): number { return this.map.size; }

  has(key: K): boolean { return this.map.has(key); }

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    // Bump to MRU.
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      const prev = this.map.get(key)!;
      if (prev !== value && this.opts.onEvict) this.opts.onEvict(key, prev);
      this.map.delete(key);
    }
    this.map.set(key, value);
    while (this.map.size > this.opts.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const v = this.map.get(oldest);
      this.map.delete(oldest);
      if (v !== undefined && this.opts.onEvict) this.opts.onEvict(oldest, v);
    }
  }

  delete(key: K): boolean {
    const v = this.map.get(key);
    if (v === undefined) return false;
    this.map.delete(key);
    if (this.opts.onEvict) this.opts.onEvict(key, v);
    return true;
  }

  clear(): void {
    if (this.opts.onEvict) {
      for (const [k, v] of this.map) this.opts.onEvict(k, v);
    }
    this.map.clear();
  }

  *values(): IterableIterator<V> { yield* this.map.values(); }
}

export class LruByBytes<K, V> {
  private readonly map = new Map<K, { value: V; bytes: number }>();
  private totalBytes = 0;

  constructor(private readonly opts: LruByBytesOpts<K, V>) {}

  get size(): number { return this.map.size; }
  get bytes(): number { return this.totalBytes; }
  has(key: K): boolean { return this.map.has(key); }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      const prev = this.map.get(key)!;
      this.totalBytes -= prev.bytes;
      if (prev.value !== value && this.opts.onEvict) this.opts.onEvict(key, prev.value);
      this.map.delete(key);
    }
    const bytes = this.opts.sizeOf(value);
    this.map.set(key, { value, bytes });
    this.totalBytes += bytes;
    // Always keep at least one entry — the value being inserted shouldn't
    // immediately evict itself just because it overshoots the budget.
    while (this.totalBytes > this.opts.maxBytes && this.map.size > 1) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const oldEntry = this.map.get(oldest);
      this.map.delete(oldest);
      if (oldEntry) {
        this.totalBytes -= oldEntry.bytes;
        if (this.opts.onEvict) this.opts.onEvict(oldest, oldEntry.value);
      }
    }
  }

  delete(key: K): boolean {
    const entry = this.map.get(key);
    if (entry === undefined) return false;
    this.map.delete(key);
    this.totalBytes -= entry.bytes;
    if (this.opts.onEvict) this.opts.onEvict(key, entry.value);
    return true;
  }

  clear(): void {
    if (this.opts.onEvict) {
      for (const [k, e] of this.map) this.opts.onEvict(k, e.value);
    }
    this.map.clear();
    this.totalBytes = 0;
  }
}
