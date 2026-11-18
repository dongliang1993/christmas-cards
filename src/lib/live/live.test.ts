import { describe, expect, it } from "vitest";
import {
  createLiveRuntime,
  kickMovers,
  packMoverUniforms,
  resolveLiveTap,
  stepLive,
  coverLocalToPx,
  MAX_MOVERS,
} from "./movers";
import { LIVE_SPECS, type LiveSpec } from "./liveSpec";
import { CARD_ASSETS } from "../cardAssets";
import { isGrabEdge, resolveRelease, resolveTap } from "../cardInteract";
import { CARD_H, CARD_W } from "../cardConstants";

const spec: LiveSpec = {
  movers: {
    tail: { pivot: [100, 100], tip: [60, 100], width: 20, sway: [4, 0.3], kick: 14, wind: 1 },
    gift: { pivot: [200, 240], area: [200, 200, 30, 30], react: "jiggle" },
    ear: { pivot: [300, 300], tip: [300, 270], width: 10, twitch: [18, 4, 10], react: "twitch" },
  },
  taps: [
    { area: [100, 100, 40, 40], kick: ["tail"] },
    { area: [200, 200, 30, 30], kick: ["gift"], sparkle: [200, 180] },
  ],
  glowTap: [400, 400, 50],
  greet: ["tail"],
};

const run = (rt: ReturnType<typeof createLiveRuntime>, seconds: number, wind = 0) => {
  let peak = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepLive(rt, 1 / 60, wind);
    peak = Math.max(peak, Math.abs(rt.movers.tail.angle));
  }
  return peak;
};

describe("live movers", () => {
  it("idle sway stays small and a kick swings close to its kick degrees", () => {
    const rt = createLiveRuntime(spec, () => 0.5);
    const idlePeak = run(rt, 5);
    expect(idlePeak).toBeGreaterThan(3);
    expect(idlePeak).toBeLessThan(5);

    kickMovers(rt, ["tail"]);
    let kickPeak = 0;
    for (let t = 0; t < 1; t += 1 / 60) {
      stepLive(rt, 1 / 60, 0);
      kickPeak = Math.max(kickPeak, Math.abs(rt.movers.tail.angle - rt.movers.tail.idle));
    }
    expect(kickPeak).toBeGreaterThan(10);
    expect(kickPeak).toBeLessThan(18);
  });

  it("a kick settles back to idle within a few seconds", () => {
    const rt = createLiveRuntime(spec, () => 0.5);
    kickMovers(rt, ["tail"]);
    run(rt, 4);
    expect(Math.abs(rt.movers.tail.angle - rt.movers.tail.idle)).toBeLessThan(0.6);
  });

  it("wind leans movers by their wind share and ignores those without", () => {
    const rt = createLiveRuntime(spec, () => 0.5);
    for (let t = 0; t < 2; t += 1 / 60) stepLive(rt, 1 / 60, 1);
    expect(rt.movers.tail.angle - rt.movers.tail.idle).toBeGreaterThan(6);
    expect(Math.abs(rt.movers.gift.angle)).toBeLessThan(0.01);
  });

  it("jiggle squashes the scale and recovers", () => {
    const rt = createLiveRuntime(spec, () => 0.5);
    kickMovers(rt, ["gift"]);
    let minScale = 1;
    for (let t = 0; t < 0.6; t += 1 / 60) {
      stepLive(rt, 1 / 60, 0);
      minScale = Math.min(minScale, rt.movers.gift.scaleY);
    }
    expect(minScale).toBeLessThan(0.93);
    for (let t = 0; t < 3; t += 1 / 60) stepLive(rt, 1 / 60, 0);
    expect(Math.abs(rt.movers.gift.scaleY - 1)).toBeLessThan(0.01);
  });

  it("twitch reaction flicks the ear right away", () => {
    const rt = createLiveRuntime(spec, () => 0.99);
    kickMovers(rt, ["ear"]);
    let peak = 0;
    for (let t = 0; t < 0.4; t += 1 / 60) {
      stepLive(rt, 1 / 60, 0);
      peak = Math.max(peak, Math.abs(rt.movers.ear.angle));
    }
    expect(peak).toBeGreaterThan(12);
  });

  it("unknown mover names are ignored", () => {
    const rt = createLiveRuntime(spec, () => 0.5);
    expect(() => kickMovers(rt, ["nope"])).not.toThrow();
  });

  it("packs uniforms with oval and capsule shapes", () => {
    const rt = createLiveRuntime(spec, () => 0.5);
    const u = packMoverUniforms(spec, rt);
    expect(u.count).toBe(3);
    // capsule tail: pivot, kind 1, tip + width
    expect(u.pivot.slice(0, 4)).toEqual([100, 100, 0.45, 1]);
    expect(u.geo.slice(0, 3)).toEqual([60, 100, 20]);
    // oval gift: kind 0, area
    expect(u.pivot[7]).toBe(0);
    expect(u.geo.slice(4, 8)).toEqual([200, 200, 30, 30]);
    expect(u.pose.length).toBe(MAX_MOVERS * 4);
  });
});

describe("live taps", () => {
  it("the glow wins over taps, then the first matching area, else open", () => {
    expect(resolveLiveTap(spec, 410, 400)).toEqual({ kind: "glow" });
    expect(resolveLiveTap(spec, 100, 120)).toMatchObject({ kind: "tap", tap: spec.taps[0] });
    expect(resolveLiveTap(spec, 205, 205)).toMatchObject({ kind: "tap", tap: spec.taps[1] });
    expect(resolveLiveTap(spec, 700, 700)).toEqual({ kind: "open" });
  });

  it("maps cover-local coordinates (centered) to cover pixels", () => {
    expect(coverLocalToPx({ x: -CARD_W / 2, y: CARD_H / 2 }, 940, 1316)).toEqual({ x: 0, y: 0 });
    const mid = coverLocalToPx({ x: 0, y: 0 }, 940, 1316);
    expect(mid.x).toBeCloseTo(470);
    expect(mid.y).toBeCloseTo(658);
  });
});

describe("live specs", () => {
  it("every card's taps, greet and kicks name real movers, within limits", () => {
    for (const [id, live] of Object.entries(LIVE_SPECS)) {
      const names = new Set(Object.keys(live.movers));
      expect(names.size, id).toBeLessThanOrEqual(MAX_MOVERS);
      for (const n of live.greet) expect(names.has(n), `${id} greet ${n}`).toBe(true);
      for (const t of live.taps) for (const n of t.kick ?? []) expect(names.has(n), `${id} tap ${n}`).toBe(true);
      for (const n of live.glowKick ?? []) expect(names.has(n), `${id} glowKick ${n}`).toBe(true);
      const { w, h } = CARD_ASSETS[id as keyof typeof CARD_ASSETS];
      for (const m of Object.values(live.movers)) {
        expect(m.pivot[0]).toBeGreaterThanOrEqual(0);
        expect(m.pivot[0]).toBeLessThanOrEqual(w);
        expect(m.pivot[1]).toBeLessThanOrEqual(h);
      }
    }
  });

  it("each card keeps the glow tap on its glow", () => {
    for (const [id, live] of Object.entries(LIVE_SPECS)) {
      const glow = CARD_ASSETS[id as keyof typeof CARD_ASSETS].glow.at;
      expect(live.glowTap?.[0], id).toBe(glow[0]);
      expect(live.glowTap?.[1], id).toBe(glow[1]);
    }
  });
});

describe("card interaction (cover local x is centred on the panel)", () => {
  it("the free edge grabs; the spine side does not", () => {
    expect(isGrabEdge({ x: CARD_W * 0.45, y: 0 }, CARD_W)).toBe(true);
    expect(isGrabEdge({ x: -CARD_W * 0.3, y: 0 }, CARD_W)).toBe(false);
  });

  it("a tap anywhere on the cover toggles, including its left half", () => {
    expect(resolveTap({ x: -CARD_W * 0.4, y: 0 }, CARD_W)).toBe("toggle");
    expect(resolveTap({ x: CARD_W * 0.4, y: 0 }, CARD_W)).toBe("toggle");
    expect(resolveTap({ x: CARD_W * 0.6, y: 0 }, CARD_W)).toBe("none");
  });

  it("release: half-way or a fling decides, both directions", () => {
    expect(resolveRelease(0.6, 0)).toBe(true);
    expect(resolveRelease(0.3, -900)).toBe(true);
    expect(resolveRelease(0.7, 900)).toBe(false);
    expect(resolveRelease(0.4, 0)).toBe(false);
  });
});
