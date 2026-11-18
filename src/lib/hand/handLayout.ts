import type { CardAssetSpec } from "../cardAssets";
import { CARD_H, CARD_THICKNESS, CARD_W } from "../cardConstants";
import { GLOW_SIZE } from "../cardGlow";

/**
 * "Dealt hand" gallery layout (reference: Desktop/01-motion.mp4): the
 * current card stands upright in front; the others fan out along a sagging
 * arc, smaller, lower, tilted outward and tucked underneath.
 *
 * Every pose is a continuous function of the card's offset from centre
 * (…-2, -1, 0, 1, 2… slots, fractional mid-move), so a drag or a spring
 * on one number moves the whole hand at once.
 */
export interface CardPose {
  x: number;
  y: number;
  z: number;
  rz: number;
  ry: number;
  scale: number;
  /** 1 = full brightness; side cards sit a little in the shade. */
  light: number;
  /** 1 or 0: cards tucked fully out of sight at the far ends are hidden. */
  opacity: number;
}

/** Centre to first neighbour, then each further step (in card widths). */
const STEP_NEAR = 0.84;
const STEP_FAR = 0.5;
/** Sag of the arc: linear + quadratic (in card heights). */
const SAG_LINEAR = 0.035;
const SAG_CURVE = 0.045;
/** Outward tilt per slot (rad): ~7° next door, ~14° two away. */
const TILT_PER_SLOT = 0.125;
/** Slight turn away from the lens, for depth. */
const TURN_PER_SLOT = 0.06;
const SHRINK_PER_SLOT = 0.18;
const MIN_SCALE = 0.6;
const SINK_PER_SLOT = 0.28;
const SHADE_PER_SLOT = 0.07;
/**
 * Past two slots a card does not fade (see-through paper looks like a ghost):
 * it slides back in under its neighbour and is hidden once fully covered.
 */
const TUCK_FROM = 2;
const TUCK_BACK = 0.4;
const TUCK_SINK = 0.45;
const TUCK_SHRINK = 0.18;
const HIDDEN_FROM = 2.95;

export function poseForOffset(o: number): CardPose {
  const a = Math.abs(o);
  const s = Math.sign(o);
  const near = Math.min(a, 1);
  const far = Math.min(Math.max(a - 1, 0), TUCK_FROM - 1);
  const tuck = Math.min(1, Math.max(0, a - TUCK_FROM));
  const arc = Math.min(a, TUCK_FROM);
  return {
    x: s * CARD_W * (STEP_NEAR * near + STEP_FAR * far - TUCK_BACK * tuck),
    y: -CARD_H * (SAG_LINEAR * arc + SAG_CURVE * arc * arc),
    z: -SINK_PER_SLOT * arc - TUCK_SINK * tuck,
    rz: -s * TILT_PER_SLOT * arc,
    ry: -s * TURN_PER_SLOT * near,
    scale: Math.max(MIN_SCALE, 1 - SHRINK_PER_SLOT * arc) * (1 - TUCK_SHRINK * tuck),
    light: 1 - SHADE_PER_SLOT * arc,
    opacity: a < HIDDEN_FROM ? 1 : 0,
  };
}

/**
 * While the centre card is opened, the rest of the hand steps aside
 * (`open` 0..1): pushed out, lowered and dimmed, making room for the spread.
 */
export function withOpenRoom(p: CardPose, o: number, open: number): CardPose {
  if (open <= 0 || Math.abs(o) < 0.5) return p;
  const s = Math.sign(o);
  return {
    ...p,
    // Solid paper all the way: pushed clear out of frame, lowered and shaded,
    // never see-through. (Left at the edge, a dimmed corner reads as a grey
    // wedge in perspective rather than as a card.)
    x: p.x + s * CARD_W * 2.4 * open,
    y: p.y - CARD_H * 0.12 * open,
    z: p.z - 0.8 * open,
    rz: p.rz - s * 0.08 * open,
    light: p.light * (1 - 0.3 * open),
  };
}

/** Offset of `slot` from the hand's position `pos`, wrapped into [-n/2, n/2). */
export function wrappedOffset(slot: number, pos: number, n: number): number {
  const d = (((slot - pos) % n) + n) % n;
  return d >= n / 2 ? d - n : d;
}

/**
 * Where a card's candle glow sits on a centred stand-in, in card units. The
 * rig's box is centred on the origin (the real card's cover frame has its
 * hinge at the left edge instead, hence the different mapping). Same sprite
 * size as the real card's glow.
 */
export function standinGlow(spec: CardAssetSpec): { x: number; y: number; z: number; scale: number } {
  return {
    x: (spec.glow.at[0] / spec.w - 0.5) * CARD_W,
    y: (0.5 - spec.glow.at[1] / spec.h) * CARD_H,
    z: CARD_THICKNESS / 2 + 0.04,
    scale: spec.glow.scale * GLOW_SIZE,
  };
}
