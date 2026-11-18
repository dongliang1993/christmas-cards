/**
 * Baking a cover's relief takes a few hundred milliseconds. The card and the
 * envelope show the same cover back to back, so bake it once per page.
 * Bounded: each template's cover, snow mask and sticker bakes, plus paper-cut
 * layers (~18 keys per paper-cut card). Room for a whole gallery: an evicted
 * prebaked surface is re-baked on the main thread (hundreds of ms) the next
 * time its card is built.
 */
const MAX = 256;
const cache = new Map<string, unknown>();
const waiters = new Map<string, Set<(value: unknown) => void>>();

function satisfy(key: string, value: unknown): void {
  for (const cb of waiters.get(key) ?? []) cb(value);
  waiters.delete(key);
}

export function cachedSurface<T>(key: string, build: () => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  const value = build();
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
  satisfy(key, value);
  return value;
}

/**
 * Fill the cache with an already-baked surface (a prebaked asset or a worker
 * result), so the synchronous bakers never run for that key. First write wins:
 * a live surface is never replaced by a later arrival.
 */
export function primeSurface<T>(key: string, value: T): void {
  if (cache.has(key)) return;
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
  satisfy(key, value);
}

/** Whether a bake key is already satisfied (primed or baked). */
export function hasSurface(key: string): boolean {
  return cache.has(key);
}

/**
 * Call `cb` with the surface once it exists: now if it is cached, else when a
 * bake or a prebaked asset lands. Never bakes itself, so a caller (e.g. the
 * hand's stand-ins) can't stall a frame. Returns an unsubscribe.
 */
export function whenSurface<T>(key: string, cb: (value: T) => void): () => void {
  if (cache.has(key)) {
    cb(cache.get(key) as T);
    return () => undefined;
  }
  const set = waiters.get(key) ?? new Set<(value: unknown) => void>();
  set.add(cb as (value: unknown) => void);
  waiters.set(key, set);
  return () => set.delete(cb as (value: unknown) => void);
}
