/**
 * Sealing wax as a height field (spec §6 火漆). Units are the stamp's radius;
 * positions scale with `spread` (0 = nothing yet, 1 = fully pressed) so the
 * puddle's outline and lip really grow, keeping their proportions.
 *
 * The profile, from the middle out: the pressed well's floor with the stamp's
 * design standing up from it and a fine border ring; the well's wall; the lip
 * the stamp squeezed up; then the overflow, wrinkled where it cooled, falling
 * off in a rounded edge along an irregular outline.
 */

/** The stamp's design, 0..1, at (u, v) in -1..1 across the stamp face. */
export type StampSampler = (u: number, v: number) => number;

const OUTLINE = 1.42;
const WELL = 0.92;
const BODY = 0.15;
const LIP = 0.075;
const LIP_AT = 1.08;
const LIP_W = 0.075;
const FLOOR = 0.09;
const BORDER = 0.022;
const RELIEF = 0.05;
/** The stamp face covers this share of the well. */
const FACE = 0.82;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function outline1(theta: number, seed: number): number {
  return (
    OUTLINE +
    0.07 * Math.sin(3 * theta + seed * 1.7) +
    0.045 * Math.sin(5 * theta + seed * 2.9) +
    0.025 * Math.sin(11 * theta + seed * 0.6)
  );
}

/** Radius of the puddle's edge at this angle. */
export function waxOutline(theta: number, spread: number, seed: number): number {
  return spread <= 0 ? 0 : spread * outline1(theta, seed);
}

/** Radius of the pressed well (the stamp is round). */
export function wellRadius(spread: number): number {
  return Math.max(0, spread) * WELL;
}

function wrinkles(rho: number, theta: number, edge: number, seed: number): number {
  const mask = smoothstep(WELL * 1.12, WELL * 1.22, rho) * (1 - smoothstep(edge * 0.92, edge, rho));
  if (mask === 0) return 0;
  // A few soft folds that wander round the puddle, fading in and out along it,
  // plus faint radial creases: cooled wax, not contour lines.
  const wander = 2.6 * Math.sin(3 * theta + seed) + 1.4 * Math.sin(7 * theta + 2 * seed) + 0.7 * Math.sin(13 * theta + 0.5 * seed);
  const fade = 0.55 + 0.45 * Math.sin(5 * theta + 1.3 * seed + 6 * rho);
  const folds = 0.013 * fade * Math.sin((rho - WELL) * 34 + wander);
  const creases = 0.004 * Math.sin(23 * theta + 6 * rho + seed) * Math.sin(9 * theta - seed);
  return mask * (folds + creases);
}

export function waxHeight(x: number, y: number, spread: number, stamp: StampSampler, seed: number): number {
  if (spread <= 0) return 0;
  const rho = Math.hypot(x, y) / spread;
  const theta = Math.atan2(y, x);
  const edge = outline1(theta, seed);
  if (rho >= edge) return 0;
  const scale = 0.6 + 0.4 * Math.min(1, spread);

  const t = Math.min(1, (edge - rho) / (0.18 * edge));
  const body = BODY * (1 - (1 - t) ** 2);
  const lip = LIP * Math.exp(-(((rho - WELL * LIP_AT) / LIP_W) ** 2));
  const outer = body + lip + wrinkles(rho, theta, edge, seed);

  const u = (rho * Math.cos(theta)) / (WELL * FACE);
  const v = (rho * Math.sin(theta)) / (WELL * FACE);
  const onFace = Math.hypot(u, v) < 1 ? stamp(u, v) : 0;
  const border = BORDER * Math.exp(-(((rho - WELL * 0.9) / 0.02) ** 2));
  const floor = FLOOR + border + RELIEF * onFace;

  const wall = smoothstep(WELL - 0.03, WELL + 0.01, rho);
  return scale * (floor * (1 - wall) + outer * wall);
}
