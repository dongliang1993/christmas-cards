import { describe, expect, it } from "vitest";
import { flapProfile, FLAP_SHUT_LIFT } from "./flapBend";

const L = 2;
const ROWS = 32;

/** Largest distance of any row from the straight line hinge→tip. */
function bow(points: { y: number; z: number }[]): number {
  const a = points[0];
  const b = points[points.length - 1];
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dy, dz);
  return Math.max(...points.map((p) => Math.abs((p.y - a.y) * dz - (p.z - a.z) * dy) / len));
}

describe("flapProfile", () => {
  it("starts at the hinge and keeps the flap's length (paper does not stretch)", () => {
    for (const fold of [0, 0.3, 0.5, 0.8, 1]) {
      const pts = flapProfile(fold, ROWS, L);
      expect(pts).toHaveLength(ROWS + 1);
      expect(pts[0].y).toBeCloseTo(0, 6);
      let len = 0;
      for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
      expect(len, `fold=${fold}`).toBeCloseTo(L, 3);
    }
  });

  it("open: points straight up, flat", () => {
    const pts = flapProfile(0, ROWS, L);
    expect(pts[ROWS].y).toBeCloseTo(L, 4);
    expect(bow(pts)).toBeLessThan(1e-6);
  });

  it("shut: lies flat over the pocket, pointing down, lifted clear of the flaps below", () => {
    const pts = flapProfile(1, ROWS, L);
    expect(pts[ROWS].y).toBeCloseTo(-L, 3);
    for (const p of pts.slice(1)) expect(p.z).toBeCloseTo(FLAP_SHUT_LIFT, 3);
    expect(bow(pts.slice(1))).toBeLessThan(1e-3);
  });

  it("mid-fold: bends like paper, most bent half-way", () => {
    const mid = bow(flapProfile(0.5, ROWS, L));
    expect(mid).toBeGreaterThan(0.08);
    expect(mid).toBeGreaterThan(bow(flapProfile(0.2, ROWS, L)));
    expect(mid).toBeGreaterThan(bow(flapProfile(0.85, ROWS, L)));
    // Its tip lags behind its root: the free end trails as it swings toward the camera.
    for (const p of flapProfile(0.5, ROWS, L)) expect(p.z).toBeGreaterThanOrEqual(-1e-9);
  });
});
