import { describe, expect, it } from "vitest";
import { createLruCache } from "./lruCache";

describe("createLruCache: keep the most recently used entries, evict the rest", () => {
  it("evicts the least recently used entry once over capacity", () => {
    const evicted: string[] = [];
    const lru = createLruCache<string, string>(2, (_k, v) => evicted.push(v));
    lru.set("a", "A");
    lru.set("b", "B");
    lru.set("c", "C");
    expect(evicted).toEqual(["A"]);
    expect(lru.get("a")).toBeUndefined();
    expect(lru.get("b")).toBe("B");
    expect(lru.get("c")).toBe("C");
  });

  it("counts a get as a use, so the entry just used survives", () => {
    const evicted: string[] = [];
    const lru = createLruCache<string, string>(2, (_k, v) => evicted.push(v));
    lru.set("a", "A");
    lru.set("b", "B");
    lru.get("a");
    lru.set("c", "C");
    expect(evicted).toEqual(["B"]);
    expect(lru.get("a")).toBe("A");
  });

  it("evicts the old value when a key is replaced with a new one", () => {
    const evicted: string[] = [];
    const lru = createLruCache<string, string>(2, (_k, v) => evicted.push(v));
    lru.set("a", "A1");
    lru.set("a", "A1");
    lru.set("a", "A2");
    expect(evicted).toEqual(["A1"]);
    expect(lru.get("a")).toBe("A2");
  });

  it("clear evicts everything", () => {
    const evicted: string[] = [];
    const lru = createLruCache<string, string>(3, (_k, v) => evicted.push(v));
    lru.set("a", "A");
    lru.set("b", "B");
    lru.clear();
    expect(evicted.sort()).toEqual(["A", "B"]);
    expect(lru.get("a")).toBeUndefined();
  });
});
