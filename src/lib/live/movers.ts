import { CARD_H, CARD_W } from "../cardConstants";
import type { LiveSpec, MoverSpec, TapSpec } from "./liveSpec";

/** Upper bound the cover shader is compiled for. */
export const MAX_MOVERS = 8;

const DEFAULT_SOFT = 0.45;
/** Spring for swings: ~1.4 Hz, lightly damped so a kick rocks a few times. */
const SWING_W = 9;
const SWING_ZETA = 0.22;
/** Spring for jiggles: quicker and bouncier. */
const JIGGLE_W = 14;
const JIGGLE_ZETA = 0.2;
/** First peak of a lightly damped spring is ~0.75 of v0/w; undo that. */
const PEAK_GAIN = 1 / 0.75;
/** How far a full breeze leans a part, as a share of its kick. */
const WIND_LEAN = 0.8;
const TWITCH_LEN = 0.32;

/**
 * Per-frame state of one mover. Mutated in place by stepLive: this runs
 * in the render loop at 60 fps, where allocating new objects every frame
 * would only feed the garbage collector.
 */
export interface MoverState {
  /** Total angle, degrees. */
  angle: number;
  /** The idle part of the angle (sway, flicker), degrees. */
  idle: number;
  /** Vertical scale about the pivot (1 = still). */
  scaleY: number;
  swing: number;
  swingV: number;
  squash: number;
  squashV: number;
  twitchAt: number;
  nextTwitch: number;
  phase: number;
}

export interface LiveRuntime {
  time: number;
  movers: Record<string, MoverState>;
  specs: Readonly<Record<string, MoverSpec>>;
  rng: () => number;
}

function nextTwitchIn(m: MoverSpec, rng: () => number): number {
  if (!m.twitch) return Infinity;
  const [, min, max] = m.twitch;
  return min + rng() * (max - min);
}

export function createLiveRuntime(spec: LiveSpec, rng: () => number = Math.random): LiveRuntime {
  const movers: Record<string, MoverState> = {};
  for (const [name, m] of Object.entries(spec.movers)) {
    movers[name] = {
      angle: 0,
      idle: 0,
      scaleY: 1,
      swing: 0,
      swingV: 0,
      squash: 0,
      squashV: 0,
      twitchAt: -1,
      nextTwitch: nextTwitchIn(m, rng),
      phase: rng() * Math.PI * 2,
    };
  }
  return { time: 0, movers, specs: spec.movers, rng };
}

/** Set movers going, each in its own `react` way. Unknown names are skipped. */
export function kickMovers(rt: LiveRuntime, names: readonly string[], strength = 1): void {
  for (const name of names) {
    const m = rt.specs[name];
    const s = rt.movers[name];
    if (!m || !s) continue;
    const react = m.react ?? "spring";
    if (react === "twitch") {
      s.twitchAt = 0;
    } else if (react === "jiggle") {
      s.squashV += ((m.kick ?? 10) * 0.01 * JIGGLE_W * PEAK_GAIN) * strength;
    } else {
      // Alternate the kick's direction with the current motion so repeated
      // taps add up instead of cancelling.
      const dir = s.swingV < 0 ? -1 : 1;
      s.swingV += dir * (m.kick ?? 10) * SWING_W * PEAK_GAIN * strength;
    }
  }
}

function idleOf(m: MoverSpec, s: MoverState, t: number): { angle: number; scale: number } {
  let angle = 0;
  let scale = 1;
  if (m.sway) angle += m.sway[0] * Math.sin(Math.PI * 2 * m.sway[1] * t + s.phase);
  if (m.flicker) {
    angle += m.flicker * 20 * (0.6 * Math.sin(11 * t + s.phase) + 0.4 * Math.sin(23.7 * t));
    scale *= 1 + m.flicker * 0.5 * (0.5 + 0.5 * Math.sin(15.3 * t + s.phase));
  }
  if (m.breathe) scale *= 1 + m.breathe[0] * Math.sin(Math.PI * 2 * m.breathe[1] * t + s.phase);
  return { angle, scale };
}

function twitchEnvelope(tau: number): number {
  if (tau < 0.16) return Math.sin((Math.PI * tau) / 0.16);
  if (tau < TWITCH_LEN) return 0.7 * Math.sin((Math.PI * (tau - 0.16)) / 0.16);
  return 0;
}

/**
 * Advance every mover by dt seconds. `wind` is the pointer's breeze,
 * -1 (blowing left) to 1 (blowing right).
 */
export function stepLive(rt: LiveRuntime, dt: number, wind: number): void {
  rt.time += dt;
  const t = rt.time;
  for (const [name, s] of Object.entries(rt.movers)) {
    const m = rt.specs[name];

    const lean = (m.wind ?? 0) * wind * (m.kick ?? 10) * WIND_LEAN;
    const acc = SWING_W * SWING_W * (lean - s.swing) - 2 * SWING_ZETA * SWING_W * s.swingV;
    s.swingV += acc * dt;
    s.swing += s.swingV * dt;

    const jAcc = -JIGGLE_W * JIGGLE_W * s.squash - 2 * JIGGLE_ZETA * JIGGLE_W * s.squashV;
    s.squashV += jAcc * dt;
    s.squash += s.squashV * dt;

    let twitch = 0;
    if (m.twitch) {
      s.nextTwitch -= dt;
      if (s.nextTwitch <= 0 && s.twitchAt < 0) s.twitchAt = 0;
      if (s.twitchAt >= 0) {
        s.twitchAt += dt;
        twitch = m.twitch[0] * twitchEnvelope(s.twitchAt);
        if (s.twitchAt > TWITCH_LEN) {
          s.twitchAt = -1;
          s.nextTwitch = nextTwitchIn(m, rt.rng);
        }
      }
    }

    const idle = idleOf(m, s, t);
    s.idle = idle.angle;
    s.angle = idle.angle + s.swing + twitch;
    s.scaleY = idle.scale * (1 - s.squash);
  }
}

export interface MoverUniforms {
  count: number;
  /** Per mover: pivot x, pivot y, soft, kind (0 oval, 1 capsule). */
  pivot: number[];
  /** Oval: cx, cy, rx, ry. Capsule: tip x, tip y, width, 0. */
  geo: number[];
  /** Angle (radians), scale y, 0, 0. */
  pose: number[];
}

export function packMoverUniforms(spec: LiveSpec, rt?: LiveRuntime): MoverUniforms {
  const names = Object.keys(spec.movers).slice(0, MAX_MOVERS);
  const pivot = new Array<number>(MAX_MOVERS * 4).fill(0);
  const geo = new Array<number>(MAX_MOVERS * 4).fill(0);
  const pose = new Array<number>(MAX_MOVERS * 4).fill(0);
  names.forEach((name, i) => {
    const m = spec.movers[name];
    const capsule = Boolean(m.tip);
    pivot.splice(i * 4, 4, m.pivot[0], m.pivot[1], m.soft ?? DEFAULT_SOFT, capsule ? 1 : 0);
    const g = capsule && m.tip
      ? [m.tip[0], m.tip[1], m.width ?? 20, 0]
      : [...(m.area ?? [m.pivot[0], m.pivot[1], 20, 20])];
    geo.splice(i * 4, 4, ...g);
    const s = rt?.movers[name];
    pose.splice(i * 4, 4, ((s?.angle ?? 0) * Math.PI) / 180, s?.scaleY ?? 1, 0, 0);
  });
  return { count: names.length, pivot, geo, pose };
}

export type LiveTapResult =
  | { kind: "glow" }
  | { kind: "tap"; tap: TapSpec }
  | { kind: "open" };

function inOval(x: number, y: number, [cx, cy, rx, ry]: readonly number[]): boolean {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

/** What a tap at cover pixel (x, y) does: the light first, then the first matching area, else open. */
export function resolveLiveTap(spec: LiveSpec, x: number, y: number): LiveTapResult {
  if (spec.glowTap) {
    const [gx, gy, r] = spec.glowTap;
    if (Math.hypot(x - gx, y - gy) <= r) return { kind: "glow" };
  }
  const tap = spec.taps.find((t) => inOval(x, y, t.area));
  return tap ? { kind: "tap", tap } : { kind: "open" };
}

/** Cover mesh local coordinates (centred, y up) to cover pixels (x right, y down). */
export function coverLocalToPx(local: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
  return {
    x: ((local.x + CARD_W / 2) / CARD_W) * w,
    y: (0.5 - local.y / CARD_H) * h,
  };
}

/** Cover pixels back to cover mesh local coordinates. */
export function coverPxToLocal(px: readonly [number, number], w: number, h: number): { x: number; y: number } {
  return {
    x: (px[0] / w) * CARD_W - CARD_W / 2,
    y: (0.5 - px[1] / h) * CARD_H,
  };
}
