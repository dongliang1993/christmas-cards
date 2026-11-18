export interface LruCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  clear(): void;
}

/**
 * A small LRU: `get` and `set` both count as a use. `onEvict` runs for every
 * value that leaves the cache (over capacity, replaced, or cleared), so the
 * owner can free what it holds (e.g. GPU textures).
 */
export function createLruCache<K, V>(capacity: number, onEvict: (key: K, value: V) => void): LruCache<K, V> {
  const entries = new Map<K, V>();
  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      const old = entries.get(key);
      entries.delete(key);
      entries.set(key, value);
      if (old !== undefined && old !== value) onEvict(key, old);
      while (entries.size > capacity) {
        const [oldestKey, oldest] = entries.entries().next().value as [K, V];
        entries.delete(oldestKey);
        onEvict(oldestKey, oldest);
      }
    },
    clear() {
      const all = [...entries];
      entries.clear();
      for (const [k, v] of all) onEvict(k, v);
    },
  };
}
