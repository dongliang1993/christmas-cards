import { CARD_IN_Y, CARD_SLOT_Z, ENV_H, ENV_W } from "./timeline";

/**
 * The paper envelope's construction (spec §2, §6), in world units, origin at
 * its centre, the flap side toward the camera. Paper layers, back to front:
 * the back panel (lined inside), the card in its slot, the two side flaps,
 * the bottom flap, and the top flap when shut.
 */
export const ENVELOPE_LAYOUT = {
  w: ENV_W,
  h: ENV_H,
  backZ: 0,
  backThickness: 0.012,
  cardInY: CARD_IN_Y,
  cardSlotZ: CARD_SLOT_Z,
  /** Extruded flap paper: depth plus both bevels. */
  flapThickness: 0.012,
  sideZ: 0.042,
  bottomZ: 0.058,
  flapHingeZ: 0.004,
  /** Where the side flaps meet in the middle: the bottom of the V. */
  apexY: 0.15,
  /** Side flaps start this far below the top corners. */
  sideTopInset: 0.04,
  sideApexX: 0.12,
  /** How far the top flap reaches down from the hinge. */
  flapDepth: 2.02,
} as const;

/** Height of a side flap's top edge (the V) at x: below it the pocket hides the card. */
export function sideFlapEdgeYAt(x: number): number {
  const L = ENVELOPE_LAYOUT;
  const ax = Math.abs(x);
  const x0 = L.w / 2;
  const y0 = L.h / 2 - L.sideTopInset;
  const t = (x0 - ax) / (x0 - L.sideApexX);
  return y0 + (L.apexY - y0) * Math.min(1, Math.max(0, t));
}
