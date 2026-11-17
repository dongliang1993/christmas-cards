import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { fitStage, shadowFootprint, studioBackgroundColor, STUDIO_BG_HEX, zoomedDistance } from "./cardStage";

describe("fitStage", () => {
  it("frames the closed card at 62% of the view height on a landscape screen", () => {
    const fov = 30;
    const { closedZ } = fitStage(2.6, 3.64, fov, 1440 / 900);
    const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * closedZ;
    expect(3.64 / visibleH).toBeCloseTo(0.62, 2);
  });

  it("lifts the card above the dock by moving the camera down", () => {
    expect(fitStage(2.6, 3.64, 30, 1.6).camYPerZ).toBeLessThan(0);
  });
});

describe("studioBackgroundColor", () => {
  it("tone-maps back onto the page colour", () => {
    const bg = studioBackgroundColor();
    // Neutral tone mapping must bring the HDR backdrop to the CSS colour,
    // so the canvas meets the page with no seam.
    const toneMapped = neutral([bg.r, bg.g, bg.b]);
    const target = new THREE.Color(STUDIO_BG_HEX);
    expect(toneMapped[0]).toBeCloseTo(target.r, 2);
    expect(toneMapped[1]).toBeCloseTo(target.g, 2);
    expect(toneMapped[2]).toBeCloseTo(target.b, 2);
  });
});

/** Khronos PBR Neutral, as in three.js' tonemapping_pars_fragment. */
function neutral(c: number[]): number[] {
  const start = 0.76;
  const x = Math.min(...c);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const s = c.map((v) => v - offset);
  const peak = Math.max(...s);
  if (peak < start) return s;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return s.map((v) => {
    const scaled = (v * newPeak) / peak;
    return scaled + (newPeak - scaled) * g;
  });
}

describe("shadowFootprint", () => {
  const W = 2.6;

  it("covers just the right panel when the card is shut", () => {
    const f = shadowFootprint(0, W);
    expect(f.left).toBeCloseTo(0);
    expect(f.right).toBeCloseTo(W);
  });

  it("covers both panels when the card lies open", () => {
    const f = shadowFootprint(Math.PI, W);
    expect(f.left).toBeCloseTo(-W);
    expect(f.right).toBeCloseTo(W);
  });

  it("does not reach past the swinging cover mid-turn", () => {
    // Cover standing straight up casts nothing to the left of the spine.
    const f = shadowFootprint(Math.PI / 2, W);
    expect(f.left).toBeCloseTo(0);
  });
});

describe("zoomedDistance", () => {
  it("brings the camera closer as zoom grows", () => {
    expect(zoomedDistance(10, 2)).toBeCloseTo(5);
  });

  it("clamps zoom to the editor's range", () => {
    expect(zoomedDistance(10, 9)).toBeCloseTo(10 / 2.6);
    expect(zoomedDistance(10, 0.01)).toBeCloseTo(10 / 0.6);
  });
});
