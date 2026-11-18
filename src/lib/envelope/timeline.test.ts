import { describe, expect, it } from "vitest";
import { CARD_H } from "@/lib/cardConstants";
import {
  CARD_REST,
  CARD_SLOT_Z,
  ENV_H,
  OPEN_TIMELINE_S,
  POCKET_MOUTH_Y,
  SEAL_TIMELINE_S,
  openPose,
  sealPose,
  type EnvelopePose,
} from "./timeline";

const samples = (end: number, step = 0.02) => Array.from({ length: Math.ceil(end / step) + 1 }, (_, i) => Math.min(end, i * step));
const cardBottom = (p: EnvelopePose) => p.card.y - p.envelope.y - CARD_H / 2;
/** Envelope fully below the card's frame (card frame spans ±CARD_H/2 around 0). */
const envelopeOffscreen = (p: EnvelopePose) => p.envelope.y + ENV_H / 2 < -CARD_H / 2 - 0.5;

describe("sealPose: the sender's sequence", () => {
  it("starts on the card exactly as the card scene leaves it, head-on, envelope out of frame", () => {
    const p = sealPose(0);
    expect(p.card).toEqual(CARD_REST);
    expect(p.camera).toEqual({ lookY: 0, distance: 1, oblique: 0 });
    expect(envelopeOffscreen(p)).toBe(true);
    expect(p.flapFold).toBe(0);
  });

  it("keeps the card in front while it is above the mouth, and at pocket depth once inside", () => {
    for (const t of samples(SEAL_TIMELINE_S)) {
      const p = sealPose(t);
      if (envelopeOffscreen(p)) continue;
      if (cardBottom(p) > POCKET_MOUTH_Y + 0.4) expect(p.card.z, `t=${t}`).toBeGreaterThan(CARD_SLOT_Z + 0.2);
      if (cardBottom(p) < POCKET_MOUTH_Y) expect(p.card.z, `t=${t}`).toBeCloseTo(CARD_SLOT_Z, 5);
    }
  });

  it("only folds the flap once the card is all the way in", () => {
    for (const t of samples(SEAL_TIMELINE_S)) {
      const p = sealPose(t);
      if (p.flapFold > 0) expect(p.card.y - p.envelope.y, `t=${t}`).toBeLessThan(0);
    }
  });

  it("ends shut, pushed in on the seal, still slightly oblique", () => {
    const p = sealPose(SEAL_TIMELINE_S);
    expect(p.flapFold).toBe(1);
    expect(p.phase).toBe("ready");
    // Closer than the head-on card framing, though the whole envelope stays in shot.
    expect(p.camera.distance).toBeLessThan(1);
    expect(sealPose(SEAL_TIMELINE_S + 5)).toEqual(p);
  });

  it("turns to an oblique angle mid-way, smoothly", () => {
    expect(sealPose(SEAL_TIMELINE_S * 0.45).camera.oblique).toBeGreaterThan(0.8);
    let prev = sealPose(0);
    for (const t of samples(SEAL_TIMELINE_S, 1 / 60)) {
      const p = sealPose(t);
      expect(Math.abs(p.camera.oblique - prev.camera.oblique), `t=${t}`).toBeLessThan(0.05);
      expect(Math.abs(p.card.y - prev.card.y), `t=${t}`).toBeLessThan(0.15);
      prev = p;
    }
  });
});

describe("openPose: the recipient's sequence", () => {
  it("starts where the sender's ended", () => {
    const a = openPose(0);
    const b = sealPose(SEAL_TIMELINE_S);
    expect(a.camera).toEqual(b.camera);
    expect(a.flapFold).toBe(1);
    expect(a.card).toEqual(b.card);
  });

  it("ends on the card exactly as the card scene starts, envelope gone", () => {
    const p = openPose(OPEN_TIMELINE_S);
    expect(p.card).toEqual(CARD_REST);
    expect(p.camera).toEqual({ lookY: 0, distance: 1, oblique: 0 });
    expect(envelopeOffscreen(p)).toBe(true);
    expect(p.phase).toBe("done");
  });

  it("opens the flap before the card moves, and lifts the card out of the pocket before it leaves", () => {
    for (const t of samples(OPEN_TIMELINE_S)) {
      const p = openPose(t);
      if (p.card.y - p.envelope.y > -0.07) expect(p.flapFold, `t=${t}`).toBe(0);
      if (!envelopeOffscreen(p) && cardBottom(p) < POCKET_MOUTH_Y) expect(p.card.z, `t=${t}`).toBeCloseTo(CARD_SLOT_Z, 5);
    }
  });
});
