import * as THREE from "three";

/**
 * Bright studio staging, matched to bubbbly: an off-white paper sweep,
 * a near-frontal camera and a card that fills ~60% of the viewport.
 */

/** Studio backdrop as the eye should see it (sRGB). Mirrors --bg-canvas. */
export const STUDIO_BG_HEX = "#fbfaf9";

/** Fraction of the viewport the card may occupy (closed / open). */
const FIT_HEIGHT = 0.62;
const FIT_WIDTH_CLOSED = 0.7;
const FIT_WIDTH_OPEN = 0.82;

/** Vertical space reserved for the bottom dock, as a fraction of height. */
const DOCK_RESERVE = 0.1;

/** three.js NeutralToneMapping (Khronos PBR Neutral), CPU copy. */
function neutralToneMap(c: readonly [number, number, number]): [number, number, number] {
  const start = 0.8 - 0.04;
  const desat = 0.15;
  const x = Math.min(c[0], c[1], c[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const shifted = c.map((v) => v - offset) as [number, number, number];
  const peak = Math.max(...shifted);
  if (peak < start) return shifted;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  const g = 1 - 1 / (desat * (peak - newPeak) + 1);
  return shifted.map((v) => {
    const scaled = (v * newPeak) / peak;
    return scaled + (newPeak - scaled) * g;
  }) as [number, number, number];
}

/**
 * Scene background colour (linear, may exceed 1) that lands on
 * STUDIO_BG_HEX after NeutralToneMapping, so the canvas meets the page
 * with no visible seam.
 */
export function studioBackgroundColor(): THREE.Color {
  const target = new THREE.Color(STUDIO_BG_HEX); // linear working space
  const want: [number, number, number] = [target.r, target.g, target.b];
  let guess: [number, number, number] = [...want];
  for (let i = 0; i < 40; i += 1) {
    const out = neutralToneMap(guess);
    guess = guess.map((g, k) => Math.max(0, g + (want[k] - out[k]) * 1.5)) as [
      number,
      number,
      number,
    ];
  }
  return new THREE.Color(guess[0], guess[1], guess[2]);
}

export interface StageFit {
  /** Camera distance for the closed card. */
  closedZ: number;
  /** Camera distance for the open (double-width) card. */
  openZ: number;
  /** Camera y per unit of camera distance, centring the card above the dock. */
  camYPerZ: number;
}

/** Distance at which an object of `size` spans `fraction` of the view. */
function distanceFor(size: number, fraction: number, halfFovTan: number): number {
  return size / (fraction * 2 * halfFovTan);
}

/** Fit the card to the viewport for both closed and open states. */
export function fitStage(
  cardW: number,
  cardH: number,
  fovDeg: number,
  aspect: number,
): StageFit {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  const tanH = tanV * aspect;
  const closedZ = Math.max(
    distanceFor(cardH, FIT_HEIGHT, tanV),
    distanceFor(cardW, FIT_WIDTH_CLOSED, tanH),
  );
  const openZ = Math.max(
    distanceFor(cardH, FIT_HEIGHT, tanV),
    distanceFor(cardW * 2, FIT_WIDTH_OPEN, tanH),
  );
  // Lift the card centre by half the dock reserve, at any camera distance.
  const camYPerZ = -(DOCK_RESERVE / 2) * 2 * tanV;
  return { closedZ, openZ, camYPerZ };
}

/**
 * Horizontal extent, in the card's own frame (spine at 0, right panel 0..W),
 * of what casts a shadow: the right panel plus the cover's projection at
 * `openAngle` (0 shut on top of the panel, π lying open to the left).
 */
export function shadowFootprint(openAngle: number, cardW: number): { left: number; right: number } {
  return { left: Math.min(0, cardW * Math.cos(openAngle)), right: cardW };
}

/** Camera distance for an editor zoom level (spec §13.5: 60%–200%). */
export function zoomedDistance(distance: number, zoom: number): number {
  return distance / Math.min(2, Math.max(0.6, zoom));
}
