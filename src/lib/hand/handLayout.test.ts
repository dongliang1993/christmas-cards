import { describe, expect, it } from "vitest";
import { CARD_ASSETS } from "../cardAssets";
import { standinGlow } from "./handLayout";

describe("standinGlow: the candle's place on a centred stand-in", () => {
  it("maps cover pixels to the centred card frame", () => {
    const glow = standinGlow(CARD_ASSETS["winter-moonlight"]);
    // at [418, 640] on a 940x1316 cover; the rig's box is centred on the origin.
    expect(glow.x).toBeCloseTo((418 / 940 - 0.5) * 2.6, 6);
    expect(glow.y).toBeCloseTo((0.5 - 640 / 1316) * 3.64, 6);
    expect(glow.z).toBeCloseTo(0.022 / 2 + 0.04, 6);
  });

  it("keeps the real card's sprite sizing (spec scale x GLOW_SIZE)", () => {
    expect(standinGlow(CARD_ASSETS["winter-moonlight"]).scale).toBeCloseTo(0.22 * 0.5, 6);
    expect(standinGlow(CARD_ASSETS["gift-atelier"]).scale).toBeCloseTo(0.24 * 0.5, 6);
  });
});
