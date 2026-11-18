import { CARD_H } from "@/lib/cardConstants";

/**
 * Where everything is at each moment of the envelope sequences (spec §4, §5,
 * §6). Pure: the scene samples these every frame. World units match the card
 * scene; y up, z toward the camera. The card's pose is in world space; inside
 * the pocket its y is measured from the envelope's (which sits at y 0 at rest).
 */

/** Envelope size (must match the paper envelope model). */
export const ENV_W = 3.0;
export const ENV_H = 4.0;
/** Where the side flaps' edges meet the card's bottom corners: below this the card is inside. */
export const POCKET_MOUTH_Y = 1.75;
/** Card centre depth inside the pocket: between the back panel and the side flaps. */
export const CARD_SLOT_Z = 0.024;
/** Card centre, relative to the envelope, once it has slid all the way in. */
export const CARD_IN_Y = -0.08;
/** Card centre hovering over the mouth, its bottom edge clear of the side flaps. */
const HOVER_Y = ENV_H / 2 + CARD_H / 2 + 0.25;
const HOVER_Z = 0.55;
const HOVER_TILT = { rotX: -0.1, rotY: 0, rotZ: 0.05 };
const INSIDE_TILT = { rotX: 0, rotY: 0, rotZ: 0 };
/** Far enough below to be out of the card's frame. */
const ENV_AWAY_Y = -7.5;

/** The closed card exactly as ChristmasCard3D rests it (baseRotX/Y/Z there). */
export const CARD_REST: Readonly<CardPose> = Object.freeze({ x: 0, y: 0, z: 0, rotX: 0.015, rotY: -0.04, rotZ: -0.006 });

/** Camera, relative to the card scene's head-on framing (distance 1 = the card's own fit). */
interface CameraPose {
  lookY: number;
  distance: number;
  /** 0 head-on, 1 the slightly top-down three-quarter view. */
  oblique: number;
}
const HEAD_ON: CameraPose = { lookY: 0, distance: 1, oblique: 0 };
const WIDE: CameraPose = { lookY: 1.6, distance: 1.5, oblique: 1 };
/** Room above for the open flap's tip (y ≈ 4) while the card goes in. */
const ON_ENVELOPE: CameraPose = { lookY: 0.6, distance: 1.3, oblique: 1 };
/** Closer on the seal, the whole envelope still in frame. */
const ON_SEAL: CameraPose = { lookY: 0.15, distance: 0.92, oblique: 0.6 };

export interface CardPose {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

export type EnvelopePhase = "handoff" | "rise" | "insert" | "settle" | "fold" | "push" | "ready" | "unfold" | "out" | "leave" | "done";

export interface EnvelopePose {
  phase: EnvelopePhase;
  envelope: { y: number };
  card: CardPose;
  /** 0 open (pointing up), 1 shut over the pocket. */
  flapFold: number;
  camera: CameraPose;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const ease = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
/** a at s=0 and exactly b at s=1. */
const mix = (a: number, b: number, s: number) => a * (1 - s) + b * s;
const mixCam = (a: CameraPose, b: CameraPose, s: number): CameraPose => ({
  lookY: mix(a.lookY, b.lookY, s),
  distance: mix(a.distance, b.distance, s),
  oblique: mix(a.oblique, b.oblique, s),
});

/** Card depth for a card whose centre is localY above the envelope's centre. */
function depthFor(localY: number): number {
  const bottom = localY - CARD_H / 2;
  const above = clamp01((bottom - POCKET_MOUTH_Y) / 0.4);
  return mix(CARD_SLOT_Z, HOVER_Z, above * above * (3 - 2 * above));
}

function cardAt(envY: number, localY: number, tilt: typeof HOVER_TILT): CardPose {
  return { x: 0, y: envY + localY, z: depthFor(localY), ...tilt };
}

function mixTilt(a: typeof HOVER_TILT, b: typeof HOVER_TILT, s: number) {
  return { rotX: mix(a.rotX, b.rotX, s), rotY: mix(a.rotY, b.rotY, s), rotZ: mix(a.rotZ, b.rotZ, s) };
}

export const SEAL_TIMELINE_S = 5.9;

export function sealPose(time: number): EnvelopePose {
  const t = Math.min(time, SEAL_TIMELINE_S);
  const lift = ease(seg(t, 0.1, 1.5));
  const rise = ease(seg(t, 0.4, 1.6));
  const insert = ease(seg(t, 1.7, 3.4));
  const settle = seg(t, 3.4, 3.8);
  const fold = ease(seg(t, 3.8, 5.0));
  const push = ease(seg(t, 4.6, 5.9));

  const dip = settle > 0 && settle < 1 ? -0.06 * Math.sin(Math.PI * settle) : 0;
  const envY = mix(ENV_AWAY_Y, 0, rise) + dip;

  let card: CardPose;
  if (insert === 0) {
    // Lift off the card scene's rest pose to hover over where the mouth will be.
    card = {
      x: 0,
      y: mix(CARD_REST.y, HOVER_Y, lift),
      z: mix(CARD_REST.z, HOVER_Z, lift),
      rotX: mix(CARD_REST.rotX, HOVER_TILT.rotX, lift),
      rotY: mix(CARD_REST.rotY, HOVER_TILT.rotY, lift),
      rotZ: mix(CARD_REST.rotZ, HOVER_TILT.rotZ, lift),
    };
  } else {
    card = cardAt(envY, mix(HOVER_Y, CARD_IN_Y, insert), mixTilt(HOVER_TILT, INSIDE_TILT, insert));
  }

  const toWide = ease(seg(t, 0.2, 1.6));
  const toEnvelope = ease(seg(t, 1.7, 3.4));
  let camera = mixCam(HEAD_ON, WIDE, toWide);
  camera = { ...mixCam(camera, ON_ENVELOPE, toEnvelope), oblique: ease(seg(t, 0.3, 2.0)) };
  camera = mixCam(camera, ON_SEAL, push);

  const phase: EnvelopePhase =
    t >= SEAL_TIMELINE_S ? "ready" : t >= 4.6 && fold >= 1 ? "push" : t >= 3.8 ? "fold" : t >= 3.4 ? "settle" : t >= 1.7 ? "insert" : t >= 0.2 ? "rise" : "handoff";
  return { phase, envelope: { y: envY }, card, flapFold: fold, camera };
}

export const OPEN_TIMELINE_S = 4.4;

export function openPose(time: number): EnvelopePose {
  const t = Math.min(time, OPEN_TIMELINE_S);
  const back = ease(seg(t, 0, 1.0));
  const unfold = ease(seg(t, 0.3, 1.4));
  const out = ease(seg(t, 1.5, 3.1));
  const leave = ease(seg(t, 3.1, OPEN_TIMELINE_S));

  const envY = mix(0, ENV_AWAY_Y, leave);
  const localY = mix(CARD_IN_Y, HOVER_Y, out);
  let card = cardAt(0, localY, mixTilt(INSIDE_TILT, HOVER_TILT, out));
  if (leave > 0) {
    card = {
      x: 0,
      y: mix(card.y, CARD_REST.y, leave),
      z: mix(card.z, CARD_REST.z, leave),
      rotX: mix(card.rotX, CARD_REST.rotX, leave),
      rotY: mix(card.rotY, CARD_REST.rotY, leave),
      rotZ: mix(card.rotZ, CARD_REST.rotZ, leave),
    };
  }

  let camera = mixCam(ON_SEAL, ON_ENVELOPE, back);
  camera = mixCam(camera, WIDE, ease(seg(t, 1.5, 3.1)));
  camera = mixCam(camera, HEAD_ON, leave);

  const phase: EnvelopePhase = t >= OPEN_TIMELINE_S ? "done" : t >= 3.1 ? "leave" : t >= 1.5 ? "out" : "unfold";
  return { phase, envelope: { y: envY }, card, flapFold: 1 - unfold, camera };
}
