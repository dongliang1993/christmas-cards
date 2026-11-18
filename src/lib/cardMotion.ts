/**
 * Open / close motion, tuned after the reference in
 * docs/references/bubbbly-christmas-cards.md: the hinge and the sideways
 * slide are two springs that start together on a click, so the card glides
 * to centre *while* the cover swings, and the swing starts from rest
 * (no first-frame pop) and lands with a small overshoot.
 */

export interface Spring {
  x: number;
  v: number;
}

export interface SpringParams {
  readonly stiffness: number;
  readonly damping: number;
}

/** Cover hinge: under-damped (ζ≈0.67), ~5% overshoot, 50% at 0.18s, 90% at 0.34s. */
export const HINGE_SPRING: SpringParams = { stiffness: 55, damping: 10 };
/** Card slide to/from centre: near-critical (ζ≈0.9), 90% at 0.41s. */
export const LAYOUT_SPRING: SpringParams = { stiffness: 70, damping: 15 };
/** Share of speed the cover keeps when it slaps shut against the card. */
export const HINGE_RESTITUTION = 0.2;

/** One semi-implicit Euler step towards `target`. Returns a new spring. */
export function stepSpring(s: Spring, target: number, p: SpringParams, dt: number): Spring {
  const v = s.v + (p.stiffness * (target - s.x) - p.damping * s.v) * dt;
  return { x: s.x + v * dt, v };
}

/** Hinge step: spring, then keep the cover between shut (0) and flat open (π), bouncing softly. */
export function stepHinge(s: Spring, target: number, dt: number): Spring {
  const n = stepSpring(s, target, HINGE_SPRING, dt);
  if (n.x < 0) return { x: 0, v: HINGE_RESTITUTION * Math.abs(n.v) };
  if (n.x > Math.PI) return { x: Math.PI, v: -HINGE_RESTITUTION * Math.abs(n.v) };
  return n;
}
