import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyPaperStock, PAPER_STOCKS, paperTintOf } from "./paperStocks";

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe("PAPER_STOCKS", () => {
  it("makes kraft a warm brown", () => {
    const c = new THREE.Color(PAPER_STOCKS.kraft.tint);
    expect(c.r).toBeGreaterThan(c.g);
    expect(c.g).toBeGreaterThan(c.b);
    expect(lum(c)).toBeLessThan(0.75);
  });

  it("makes pearl smoother than cold-press, with an iridescent sheen", () => {
    expect(PAPER_STOCKS.pearl.roughness).toBeLessThan(PAPER_STOCKS["cold-press"].roughness);
    expect(PAPER_STOCKS.pearl.iridescence).toBeGreaterThan(0);
    expect(PAPER_STOCKS["cold-press"].iridescence).toBe(0);
  });
});

describe("applyPaperStock", () => {
  it("sets tint, roughness and iridescence on every given material", () => {
    const a = new THREE.MeshPhysicalMaterial();
    const b = new THREE.MeshPhysicalMaterial();
    applyPaperStock([a, b], "pearl");
    for (const m of [a, b]) {
      expect(m.roughness).toBeCloseTo(PAPER_STOCKS.pearl.roughness);
      expect(m.iridescence).toBeCloseTo(PAPER_STOCKS.pearl.iridescence);
      expect(m.color.getHexString()).toBe(new THREE.Color(PAPER_STOCKS.pearl.tint).getHexString());
    }
  });

  it("remembers the tint so shading can darken it without losing it", () => {
    const m = new THREE.MeshPhysicalMaterial();
    applyPaperStock([m], "kraft");
    m.color.multiplyScalar(0.5);
    expect(paperTintOf(m).getHexString()).toBe(new THREE.Color(PAPER_STOCKS.kraft.tint).getHexString());
  });
});
