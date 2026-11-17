import type { CardTemplateId } from "./types";

export interface MotifSpec {
  /** Crop rectangle [x, y, w, h] in 940x1316 cover coordinates */
  from: [number, number, number, number];
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
}

export const CARD_ASSETS: Record<CardTemplateId, CardAssetSpec> = {
  "first-snow": {
    coverSrc: "/assets/cards/first-snow/cover.png",
    w: 940,
    h: 1316,
    relief: 3.2,
    motifs: {
      left: [{ from: [350, 225, 240, 240], at: [0.5, 0.45], width: 0.44 }],
      insert: [{ from: [185, 760, 110, 110], at: [0.5, 0.84], width: 0.16 }],
      back: [{ from: [350, 225, 240, 240], at: [0.5, 0.72], width: 0.14 }],
    },
    lifted: [
      { box: [355, 230, 230, 230], lift: 0.016, bob: 0.002 },
    ],
    glow: {
      at: [356, 845],
      color: 0xffb854,
      scale: 0.78,
      flicker: true,
    },
    snowArea: [165, 225, 610, 620],
  },
  "home-christmas": {
    coverSrc: "/assets/cards/home-christmas/cover.png",
    w: 940,
    h: 1316,
    relief: 3.2,
    motifs: {
      left: [{ from: [215, 260, 130, 130], at: [0.5, 0.45], width: 0.34 }],
      insert: [{ from: [425, 620, 90, 90], at: [0.5, 0.84], width: 0.14 }],
      back: [{ from: [425, 620, 90, 90], at: [0.5, 0.72], width: 0.12 }],
    },
    lifted: [
      { box: [225, 270, 110, 110], lift: 0.012, bob: 0.002, twinkle: true },
    ],
    glow: {
      at: [470, 740],
      color: 0xffc866,
      scale: 0.9,
      flicker: false,
    },
    snowArea: [165, 220, 610, 680],
  },
  "sweet-dreams": {
    coverSrc: "/assets/cards/sweet-dreams/cover.png",
    w: 940,
    h: 1316,
    relief: 3.2,
    motifs: {
      left: [{ from: [540, 265, 130, 130], at: [0.5, 0.45], width: 0.34 }],
      insert: [{ from: [540, 265, 130, 130], at: [0.5, 0.84], width: 0.14 }],
      back: [{ from: [540, 265, 130, 130], at: [0.5, 0.72], width: 0.12 }],
    },
    lifted: [
      { box: [545, 270, 120, 120], lift: 0.014, bob: 0.0025, twinkle: true },
    ],
    glow: {
      at: [600, 325],
      color: 0xffe49e,
      scale: 0.85,
      flicker: false,
    },
    snowArea: [165, 220, 610, 680],
  },
  "lantern-light": {
    coverSrc: "/assets/cards/lantern-light/cover.png",
    w: 940,
    h: 1316,
    relief: 3.2,
    motifs: {
      left: [{ from: [225, 265, 120, 120], at: [0.5, 0.45], width: 0.34 }],
      insert: [{ from: [225, 265, 120, 120], at: [0.5, 0.84], width: 0.14 }],
      back: [{ from: [225, 265, 120, 120], at: [0.5, 0.72], width: 0.12 }],
    },
    lifted: [
      { box: [230, 270, 110, 110], lift: 0.014, bob: 0.002, twinkle: true },
    ],
    glow: {
      at: [386, 585],
      color: 0xffb854,
      scale: 0.92,
      flicker: true,
    },
    snowArea: [165, 220, 610, 680],
  },
};
