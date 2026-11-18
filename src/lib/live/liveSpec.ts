import type { ActiveTemplateId, CardTemplateId } from "../types";
import { DEFAULT_TEMPLATE_ID } from "../templates";

/**
 * "Living card" data, after the interactive-greeting-card skill's `live`
 * block: parts of the cover that move about a pivot, places a tap reacts
 * instead of opening the card, and who says hello as the card lands.
 * All positions are cover pixels (940 x 1316, x right, y down).
 */
export type Pt = readonly [number, number];
/** Oval patch: [centre x, centre y, radius x, radius y]. */
export type Oval = readonly [number, number, number, number];

export type MoverReact = "spring" | "twitch" | "jiggle";

export interface MoverSpec {
  /** The point it turns about (where a tail joins the body). */
  pivot: Pt;
  /** Oval patch, for blobs (a gift, a wreath, a body). */
  area?: Oval;
  /** Capsule patch from the pivot to the tip, for long parts (tails, ears, trees). */
  tip?: Pt;
  width?: number;
  /** Share of the patch that eases out at its edge. */
  soft?: number;
  /** [degrees, hz]: a gentle sway, all the time. */
  sway?: readonly [number, number];
  /** [degrees, min s, max s]: a quick double flick every so often. */
  twitch?: readonly [number, number, number];
  /** [share, hz]: swells and settles upward from the pivot. */
  breathe?: readonly [number, number];
  /** Share: wobbles and stretches like a flame. */
  flicker?: number;
  /** What a tap or greeting does. Default spring. */
  react?: MoverReact;
  /** Degrees a kick swings it (spring), or how hard a jiggle squashes (x0.01). */
  kick?: number;
  /** 0..1: how much the pointer's breeze leans it. */
  wind?: number;
}

export interface TapSpec {
  area: Oval;
  kick?: readonly string[];
  /** A small burst of sparkles from here. */
  sparkle?: Pt;
  /** Nudge the lifted pieces (the moon) so they bob and glint. */
  lift?: boolean;
}

export interface LiveSpec {
  movers: Readonly<Record<string, MoverSpec>>;
  taps: readonly TapSpec[];
  /** [x, y, radius]: tapping the light makes it flare and throw sparks. */
  glowTap?: readonly [number, number, number];
  /** Movers the glow tap also kicks (a candle flame). */
  glowKick?: readonly string[];
  /** Movers that say hello as the card lands. */
  greet: readonly string[];
}

const TREE = { soft: 0.4, sway: [0.6, 0.16], kick: 4, wind: 0.5 } as const;

/** Active cards' specs; legacy ids are aliased to the default below. */
const ACTIVE_LIVE_SPECS = {
  "winter-moonlight": {
    // Paper-cut window: the chimney smoke drifts, the two big pines lean in the breeze.
    movers: {
      smoke: { pivot: [362, 548], tip: [374, 462], width: 26, soft: 0.5, sway: [2.2, 0.28], kick: 10, wind: 0.8 },
      treeL: { pivot: [272, 690], tip: [272, 455], width: 72, ...TREE },
      treeR: { pivot: [690, 750], tip: [690, 555], width: 68, ...TREE },
    },
    taps: [],
    glowTap: [418, 640, 60],
    greet: ["treeL", "treeR"],
  },
  "forest-letter": {
    movers: {
      smoke: { pivot: [413, 549], tip: [413, 448], width: 24, soft: 0.5, sway: [2.0, 0.26], kick: 10, wind: 0.8 },
      treeL: { pivot: [262, 745], tip: [262, 345], width: 76, ...TREE },
      treeR: { pivot: [676, 805], tip: [676, 615], width: 58, ...TREE },
    },
    taps: [],
    glowTap: [427, 612, 60],
    greet: ["treeL", "treeR"],
  },
  "gift-atelier": {
    movers: {
      tree: { pivot: [470, 745], tip: [470, 250], width: 120, soft: 0.45, sway: [0.5, 0.18], kick: 3, wind: 0.4 },
      lampL: { pivot: [206, 188], tip: [206, 258], width: 26, soft: 0.45, sway: [1.8, 0.32], kick: 8, wind: 0.7 },
      lampR: { pivot: [734, 188], tip: [734, 258], width: 26, soft: 0.45, sway: [1.8, 0.3], kick: 8, wind: 0.7 },
    },
    taps: [],
    glowTap: [470, 252, 60],
    greet: ["lampL", "lampR", "tree"],
  },
  "snow-town": {
    movers: {
      // streetlamp lantern on the bridge's right end (cover pixels)
      lamp: { pivot: [700, 690], tip: [700, 780], width: 30, soft: 0.45, sway: [1.5, 0.3], kick: 8, wind: 0.7 },
      // snowman scarf, on the bridge's left end
      scarf: { pivot: [250, 860], area: [250, 880, 40, 30], soft: 0.4, sway: [0.8, 0.2], kick: 6, wind: 0.5 },
    },
    taps: [],
    glowTap: [710, 700, 60],
    greet: ["lamp", "scarf"],
  },
} satisfies Record<ActiveTemplateId, LiveSpec>;

export const LIVE_SPECS: Record<CardTemplateId, LiveSpec> = {
  ...ACTIVE_LIVE_SPECS,
  // Legacy covers were retired: their letters render with the default
  // template's live behaviour instead.
  "first-snow": ACTIVE_LIVE_SPECS[DEFAULT_TEMPLATE_ID],
  "home-christmas": ACTIVE_LIVE_SPECS[DEFAULT_TEMPLATE_ID],
  "sweet-dreams": ACTIVE_LIVE_SPECS[DEFAULT_TEMPLATE_ID],
  "lantern-light": ACTIVE_LIVE_SPECS[DEFAULT_TEMPLATE_ID],
};
