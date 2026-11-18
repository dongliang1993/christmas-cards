import { describe, expect, it } from "vitest";
import { CARD_H, CARD_THICKNESS, CARD_W } from "@/lib/cardConstants";
import { ENVELOPE_LAYOUT as L, sideFlapEdgeYAt } from "./envelopeLayout";
import { FLAP_SHUT_LIFT } from "./flapBend";
import { CARD_SLOT_Z, ENV_H, ENV_W, POCKET_MOUTH_Y } from "./timeline";

describe("ENVELOPE_LAYOUT", () => {
  it("is the size the timeline animates", () => {
    expect(L.w).toBe(ENV_W);
    expect(L.h).toBe(ENV_H);
  });

  it("stacks the paper: back, card, side flaps, bottom flap, then the shut top flap", () => {
    const backFront = L.backZ + L.backThickness / 2;
    const cardBack = CARD_SLOT_Z - CARD_THICKNESS / 2;
    const cardFront = CARD_SLOT_Z + CARD_THICKNESS / 2;
    expect(cardBack).toBeGreaterThan(backFront);
    expect(L.sideZ).toBeGreaterThan(cardFront);
    expect(L.bottomZ).toBeGreaterThan(L.sideZ + L.flapThickness);
    expect(L.flapHingeZ + FLAP_SHUT_LIFT).toBeGreaterThan(L.bottomZ + L.flapThickness);
  });

  it("fits the card in the pocket with a margin", () => {
    expect(CARD_W).toBeLessThan(L.w - 0.2);
    expect(L.cardInY - CARD_H / 2).toBeGreaterThan(-L.h / 2);
  });

  it("puts the side flaps' edge where the timeline says the card goes in", () => {
    const y = sideFlapEdgeYAt(CARD_W / 2);
    expect(y).toBeLessThanOrEqual(POCKET_MOUTH_Y);
    expect(y).toBeGreaterThan(POCKET_MOUTH_Y - 0.1);
    expect(sideFlapEdgeYAt(-CARD_W / 2)).toBeCloseTo(y, 6);
  });

  it("closes the flap past the V's apex so no gap shows", () => {
    expect(L.h / 2 - L.flapDepth).toBeLessThan(L.apexY);
  });
});
