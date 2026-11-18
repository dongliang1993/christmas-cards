import { describe, expect, it } from "vitest";
import {
  baseSurfaceKey,
  coverSurfaceKey,
  layerSurfaceKey,
  leftStickersKey,
  sheetStickersKey,
  snowMaskKey,
} from "./bakeKeys";

/**
 * These keys are the contract between the runtime bakers, the prebaked-asset
 * manifest and the worker: a prebaked file only counts when its key matches
 * exactly what the runtime would have computed. Bake-parameter changes (relief,
 * tooth) change the key, which is what makes stale assets miss automatically.
 */
describe("bakeKeys: the cache-key contract", () => {
  it("cover key carries the source, scaled relief and tooth", () => {
    expect(coverSurfaceKey("winter-moonlight")).toBe("/assets/cards/winter-moonlight/cover.webp|1|2.2");
    expect(coverSurfaceKey("gift-atelier")).toBe("/assets/cards/gift-atelier/cover.webp|1|2.2");
  });

  it("base key carries the card, scaled relief and tooth", () => {
    expect(baseSurfaceKey("winter-moonlight")).toBe("base|winter-moonlight|1|2.2");
  });

  it("snow and sticker keys are stable per card", () => {
    expect(snowMaskKey("winter-moonlight")).toBe("snow|winter-moonlight");
    expect(leftStickersKey("winter-moonlight")).toBe("left-stickers|winter-moonlight");
    expect(sheetStickersKey("winter-moonlight")).toBe("sheet-stickers|winter-moonlight");
  });

  it("layer key carries the source and the requested width verbatim", () => {
    expect(layerSurfaceKey("/assets/cards/winter-moonlight/elements/moon.webp", 315)).toBe(
      "layer|/assets/cards/winter-moonlight/elements/moon.webp|315",
    );
  });
});
