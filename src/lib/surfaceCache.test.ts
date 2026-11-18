import { describe, expect, it } from "vitest";
import { cachedSurface, hasSurface, primeSurface, whenSurface } from "./surfaceCache";

describe("cachedSurface: bake a cover once per page", () => {
  it("builds once per key and hands back the same result", () => {
    let builds = 0;
    const build = () => ({ n: ++builds });
    const a = cachedSurface("cover.png|1", build);
    const b = cachedSurface("cover.png|1", build);
    expect(b).toBe(a);
    expect(builds).toBe(1);
    expect(cachedSurface("cover.png|0.5", build)).not.toBe(a);
    expect(builds).toBe(2);
  });
});

describe("primeSurface: prebaked assets fill the cache without baking", () => {
  it("hands back the primed value without running the build", () => {
    const primed = { normal: "n", surface: "s" };
    primeSurface("prebaked|1", primed);
    let builds = 0;
    const value = cachedSurface("prebaked|1", () => {
      builds += 1;
      return { normal: "other" };
    });
    expect(value).toBe(primed);
    expect(builds).toBe(0);
  });

  it("keeps the first primed value when primed twice", () => {
    const first = { normal: "first" };
    primeSurface("prebaked|twice", first);
    primeSurface("prebaked|twice", { normal: "second" });
    expect(cachedSurface("prebaked|twice", () => ({ normal: "built" }))).toBe(first);
  });
});

describe("hasSurface: which bake keys still need work", () => {
  it("is false before and true after a key is primed or built", () => {
    expect(hasSurface("missing|1")).toBe(false);
    primeSurface("missing|1", { normal: "n" });
    expect(hasSurface("missing|1")).toBe(true);
    expect(hasSurface("missing|2")).toBe(false);
    cachedSurface("missing|2", () => ({ normal: "n" }));
    expect(hasSurface("missing|2")).toBe(true);
  });
});

describe("whenSurface: stand-ins wait for a surface without baking", () => {
  it("fires immediately when the surface already exists", () => {
    primeSurface("snow|ready", "mask");
    const seen: string[] = [];
    whenSurface("snow|ready", (v) => seen.push(v as string));
    expect(seen).toEqual(["mask"]);
  });

  it("fires once the surface is primed later, and can unsubscribe", () => {
    const seen: string[] = [];
    const off = whenSurface("snow|later", (v) => seen.push(v as string));
    expect(seen).toEqual([]);
    primeSurface("snow|later", "mask");
    expect(seen).toEqual(["mask"]);
    primeSurface("snow|later", "ignored");
    expect(seen).toEqual(["mask"]);
    off();
  });

  it("also fires when the surface is baked synchronously", () => {
    const seen: string[] = [];
    whenSurface("snow|sync", (v) => seen.push(v as string));
    cachedSurface("snow|sync", () => "baked");
    expect(seen).toEqual(["baked"]);
  });

  it("unsubscribing before the bake prevents the callback", () => {
    const seen: string[] = [];
    const off = whenSurface("snow|never", (v) => seen.push(v as string));
    off();
    primeSurface("snow|never", "mask");
    expect(seen).toEqual([]);
  });
});
