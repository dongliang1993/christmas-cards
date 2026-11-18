import forestLetter from "./cards/forest-letter.layers.json";
import giftAtelier from "./cards/gift-atelier.layers.json";
import snowTown from "./cards/snow-town.layers.json";
import winterMoonlight from "./cards/winter-moonlight.layers.json";
import { DEFAULT_TEMPLATE_ID } from "./templates";
import type { ActiveTemplateId, CardTemplateId } from "./types";

export interface MotifSpec {
  /** Crop rectangle [x, y, w, h] in 940x1316 cover coordinates (soft oval crop). */
  from?: [number, number, number, number];
  /**
   * Or a paper-cut element's own transparent image, drawn whole and crisp.
   * Must be one the card loads (a layer of its cover).
   */
  src?: string;
  /** Normalized [x, y] placement on target page (0..1) */
  at: [number, number];
  /** Normalized width relative to page width */
  width: number;
  /** Optional rotation in degrees */
  turn?: number;
}

export interface LiftedSpec {
  /** Crop rectangle [x, y, w, h] in 940x1316 cover coordinates */
  box: [number, number, number, number];
  /** Z elevation in 3D space */
  lift: number;
  /** Gentle bob amplitude */
  bob: number;
  twinkle?: boolean;
}

/** One paper element raised off a layered cover (its own transparent PNG). */
export interface LayerSpec {
  id: string;
  src: string;
  /** [x, y, width] in 940x1316 cover pixels; height follows the image's aspect. */
  box: readonly [number, number, number];
  /** Height above the cover, in card units (the card is 0.022 thick). */
  lift: number;
  /** Gentle bob amplitude. */
  bob?: number;
}

/**
 * A paper-cut cover built in layers: the real card shows `base` with each
 * item raised as its own paper piece; `coverSrc` is the same picture
 * flattened (scripts/compose_layers.py) for stand-ins, thumbnails and the
 * envelope.
 */
export interface LayeredCover {
  base: string;
  items: readonly LayerSpec[];
}

function layeredCover(layout: { base: string; items: Array<{ id: string; src: string; box: number[]; lift: number; bob?: number }> }): LayeredCover {
  return {
    base: layout.base,
    items: layout.items.map((it) => ({ ...it, box: [it.box[0], it.box[1], it.box[2]] as const })),
  };
}

export interface CardAssetSpec {
  coverSrc: string;
  w: number;
  h: number;
  relief: number;
  motifs: {
    left: MotifSpec[];
    insert: MotifSpec[];
    back: MotifSpec[];
  };
  lifted: LiftedSpec[];
  glow: {
    /** Pixel coordinates [x, y] on 940x1316 cover */
    at: [number, number];
    color: number;
    scale: number;
    flicker: boolean;
  };
  /** Snowfall box [x, y, w, h] in 940x1316 cover coordinates */
  snowArea: [number, number, number, number];
  /** Raised paper layers over a base cover (paper-cut cards). */
  layers?: LayeredCover;
  /** Bake gold accents as metal foil (artwork painted with real gold). */
  goldFoil?: boolean;
  /** Paper tooth strength for the cover bake (1 = default); art on smooth paper wants more. */
  paperTooth?: number;
}

/** Active cards' assets; legacy ids are aliased to the default below. */
const ACTIVE_CARD_ASSETS = {
  "winter-moonlight": {
    coverSrc: winterMoonlight.cover,
    w: 940,
    h: 1316,
    // Same relief as the painted covers; the art is on smooth paper, so the tooth is raised.
    relief: 3.2,
    // The elements themselves, whole and crisp (sized for this in the layout's `motifs`).
    motifs: {
      left: [{ src: "/assets/cards/winter-moonlight/elements/snowflake-3.webp", at: [0.5, 0.44], width: 0.52 }],
      insert: [{ src: "/assets/cards/winter-moonlight/elements/star-2.webp", at: [0.5, 0.84], width: 0.17 }],
      back: [{ src: "/assets/cards/winter-moonlight/elements/snowflake-3.webp", at: [0.5, 0.72], width: 0.14 }],
    },
    lifted: [],
    glow: {
      at: [418, 640],
      color: 0xffd27a,
      // Tiny cottage windows: a small glow, or it washes the whole window scene.
      scale: 0.22,
      flicker: false,
    },
    snowArea: [218, 140, 504, 655],
    layers: layeredCover(winterMoonlight),
    goldFoil: true,
    paperTooth: 2.2,
  },
  "forest-letter": {
    coverSrc: forestLetter.cover,
    w: 940,
    h: 1316,
    relief: 3.2,
    motifs: {
      left: [{ src: "/assets/cards/forest-letter/elements/crest.webp", at: [0.5, 0.44], width: 0.52 }],
      insert: [{ src: "/assets/cards/forest-letter/elements/star-gold.webp", at: [0.5, 0.84], width: 0.16 }],
      back: [{ src: "/assets/cards/forest-letter/elements/crest.webp", at: [0.5, 0.72], width: 0.14 }],
    },
    lifted: [],
    glow: {
      at: [427, 612],
      color: 0xffd27a,
      scale: 0.22,
      flicker: false,
    },
    snowArea: [215, 130, 510, 720],
    layers: layeredCover(forestLetter),
    goldFoil: true,
    paperTooth: 2.2,
  },
  "gift-atelier": {
    coverSrc: giftAtelier.cover,
    w: 940,
    h: 1316,
    relief: 3.2,
    motifs: {
      left: [{ src: "/assets/cards/gift-atelier/elements/clock-crest.webp", at: [0.5, 0.44], width: 0.48 }],
      insert: [{ src: "/assets/cards/gift-atelier/elements/candy-canes.webp", at: [0.5, 0.84], width: 0.16 }],
      back: [{ src: "/assets/cards/gift-atelier/elements/clock-crest.webp", at: [0.5, 0.72], width: 0.14 }],
    },
    lifted: [],
    glow: {
      at: [470, 252],
      color: 0xffd27a,
      scale: 0.24,
      flicker: true,
    },
    snowArea: [135, 185, 670, 585],
    layers: layeredCover(giftAtelier),
    goldFoil: true,
    paperTooth: 2.2,
  },
  "snow-town": {
    coverSrc: snowTown.cover,
    w: 940,
    h: 1316,
    relief: 3.2,
    motifs: {
      left: [{ src: "/assets/cards/snow-town/elements/snowflake-main.webp", at: [0.5, 0.44], width: 0.48 }],
      insert: [{ src: "/assets/cards/snow-town/elements/star-icicle.webp", at: [0.5, 0.84], width: 0.16 }],
      back: [{ src: "/assets/cards/snow-town/elements/snowflake-main.webp", at: [0.5, 0.72], width: 0.14 }],
    },
    lifted: [],
    glow: {
      at: [710, 700],
      color: 0xffd27a,
      scale: 0.24,
      flicker: true,
    },
    snowArea: [150, 180, 640, 560],
    layers: layeredCover(snowTown),
    goldFoil: true,
    paperTooth: 2.2,
  },
} satisfies Record<ActiveTemplateId, CardAssetSpec>;

/**
 * Legacy covers whose art was retired from public/assets. Letters already
 * stored with these ids still validate (letter/schema) and render, falling
 * back to the default card's assets.
 */
export const CARD_ASSETS: Record<CardTemplateId, CardAssetSpec> = {
  ...ACTIVE_CARD_ASSETS,
  "first-snow": ACTIVE_CARD_ASSETS[DEFAULT_TEMPLATE_ID],
  "home-christmas": ACTIVE_CARD_ASSETS[DEFAULT_TEMPLATE_ID],
  "sweet-dreams": ACTIVE_CARD_ASSETS[DEFAULT_TEMPLATE_ID],
  "lantern-light": ACTIVE_CARD_ASSETS[DEFAULT_TEMPLATE_ID],
};
