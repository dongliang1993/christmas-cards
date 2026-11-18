import { describe, expect, it } from "vitest";
import { waxHeight, waxOutline, wellRadius } from "./waxHeight";

const flat = (_u: number, _v: number) => 0;
const SEED = 3;
const around = (n = 360) => Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2);
const spreadOf = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};
const at = (r: number, th: number, spread = 1, stamp = flat) => waxHeight(r * Math.cos(th), r * Math.sin(th), spread, stamp, SEED);

describe("waxOutline: a puddle, not a coin", () => {
  it("wanders with the angle", () => {
    const rs = around().map((th) => waxOutline(th, 1, SEED));
    expect(Math.max(...rs) - Math.min(...rs)).toBeGreaterThan(0.08);
  });

  it("is nothing before the wax spreads, and grows as it spreads", () => {
    expect(waxOutline(0.7, 0, SEED)).toBe(0);
    for (const th of around(24)) expect(waxOutline(th, 0.5, SEED)).toBeLessThan(waxOutline(th, 1, SEED));
  });
});

describe("waxHeight", () => {
  it("has no wax outside the outline or before it spreads", () => {
    expect(at(0.2, 0, 0)).toBe(0);
    for (const th of around(36)) expect(at(waxOutline(th, 1, SEED) * 1.01, th)).toBe(0);
  });

  it("raises a lip above the pressed well floor, with a crisp wall between", () => {
    const th = 0.4;
    const W = wellRadius(1);
    const floor = at(W * 0.5, th);
    const lip = Math.max(...Array.from({ length: 40 }, (_, i) => at(W * (1 + i * 0.01), th)));
    expect(lip).toBeGreaterThan(floor + 0.08);
    // The wall: height climbs most of the way within 6% of the radius.
    expect(at(W * 1.03, th) - at(W * 0.97, th)).toBeGreaterThan(0.06);
  });

  it("stands the stamp's design up in relief on the well floor", () => {
    const stamp = (u: number, v: number) => (Math.hypot(u, v) < 0.3 ? 1 : 0);
    expect(at(0.05, 0, 1, stamp) - at(0.05, 0, 1)).toBeGreaterThan(0.02);
  });

  it("wrinkles the overflow but leaves the well floor smooth", () => {
    const W = wellRadius(1);
    const floorRing = around(180).map((th) => at(W * 0.6, th));
    expect(spreadOf(floorRing)).toBeLessThan(1e-6);
    // Ripples along the overflow, beyond the smooth fall-off. The folds fade in
    // and out round the puddle, so look along a few directions.
    const ripple = around(8).map((th0) => {
      const R = waxOutline(th0, 1, SEED);
      const overflow = Array.from({ length: 120 }, (_, i) => at(W + (R - W) * (0.35 + i * 0.005), th0));
      // A smooth fall-off bends one way; folds keep flipping the bend.
      const bends = overflow.slice(2).map((h, i) => h - 2 * overflow[i + 1] + overflow[i]).filter((d) => Math.abs(d) > 1e-6);
      return bends.slice(1).filter((d, i) => Math.sign(d) !== Math.sign(bends[i])).length;
    });
    expect(Math.max(...ripple)).toBeGreaterThanOrEqual(2);
    // Without folds the same walk bends one way only.
    const smooth = Array.from({ length: 120 }, (_, i) => at(W * 0.2 + i * 0.002, 0.3));
    const smoothBends = smooth.slice(2).map((h, i) => h - 2 * smooth[i + 1] + smooth[i]).filter((d) => Math.abs(d) > 1e-6);
    expect(smoothBends.slice(1).filter((d, i) => Math.sign(d) !== Math.sign(smoothBends[i])).length).toBe(0);
  });

  it("keeps its proportions as it spreads: the lip still stands over the floor", () => {
    const ratio = (s: number) => {
      const W = wellRadius(s);
      const lip = Math.max(...Array.from({ length: 40 }, (_, i) => at(W * (1 + i * 0.01), 0, s)));
      return lip / at(W * 0.5, 0, s);
    };
    expect(ratio(0.6)).toBeCloseTo(ratio(1), 1);
  });
});
