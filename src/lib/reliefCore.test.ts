import { describe, expect, it } from "vitest";
import { alphaMask, bakeSurfacePixels, goldness, MATERIAL_PRESETS } from "./reliefCore";
import { parseStickerManifest } from "./stickers/stickerManifest";

/** A w×h RGBA image: opaque red disc of radius r in the middle, clear elsewhere. */
function disc(w: number, h: number, r: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      const inside = Math.hypot(x - w / 2, y - h / 2) < r;
      px[o] = 200;
      px[o + 1] = 40;
      px[o + 2] = 40;
      px[o + 3] = inside ? 255 : 0;
    }
  }
  return px;
}

const at = (px: Uint8ClampedArray, w: number, x: number, y: number) => {
  const o = (y * w + x) * 4;
  return [px[o], px[o + 1], px[o + 2]];
};

describe("alphaMask", () => {
  it("is 1 on opaque pixels and 0 on clear ones", () => {
    const mask = alphaMask(disc(32, 32, 8), 32, 32);
    expect(mask[16 * 32 + 16]).toBe(1);
    expect(mask[0]).toBe(0);
  });
});

describe("bakeSurfacePixels with a sticker mask", () => {
  const w = 64;
  const h = 64;
  const px = disc(w, h, 18);
  const mask = alphaMask(px, w, h);

  it("leaves the clear surroundings flat", () => {
    const { normal } = bakeSurfacePixels(px, w, h, { mask, material: "paint" });
    const [r, g, b] = at(normal, w, 2, 2);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 128)).toBeLessThanOrEqual(1);
    expect(b).toBeGreaterThan(250);
  });

  it("tilts the normal at the sticker's raised edge", () => {
    const { normal } = bakeSurfacePixels(px, w, h, { mask, material: "paint" });
    // Left edge of the disc: height rises to the right, so the normal leans left (R < 128).
    const [r] = at(normal, w, w / 2 - 18, h / 2);
    expect(r).toBeLessThan(118);
  });

  it("makes foil metallic inside the sticker", () => {
    const { surface } = bakeSurfacePixels(px, w, h, { mask, material: "foil" });
    const [, rough, metal] = at(surface, w, w / 2, h / 2);
    expect(metal / 255).toBeGreaterThanOrEqual(MATERIAL_PRESETS.foil.metalness - 0.01);
    expect(rough / 255).toBeLessThan(0.5);
  });

  it("keeps paint non-metallic", () => {
    const { surface } = bakeSurfacePixels(px, w, h, { mask, material: "paint" });
    expect(at(surface, w, w / 2, h / 2)[2]).toBe(0);
  });
});

describe("parseStickerManifest", () => {
  const good = { set: "winter", stickers: [{ id: "holly", label: "冬青", material: "paint", src: "/assets/stickers/winter/holly.png" }] };

  it("accepts the generated manifest", () => {
    expect(parseStickerManifest(good).stickers[0].id).toBe("holly");
  });

  it("rejects an unknown material", () => {
    expect(() => parseStickerManifest({ ...good, stickers: [{ ...good.stickers[0], material: "chrome" }] })).toThrow();
  });

  it("rejects a sticker without a source", () => {
    expect(() => parseStickerManifest({ ...good, stickers: [{ ...good.stickers[0], src: "" }] })).toThrow();
  });
});

describe("goldness: gold foil picked out by colour", () => {
  it("reads the paper-cut set's gold as foil", () => {
    expect(goldness(201, 164, 92)).toBeGreaterThan(0.8); // #C9A45C
    expect(goldness(237, 200, 135)).toBeGreaterThan(0.6); // a lit gold star
  });
  it("leaves cream paper, berries, pine and night sky alone", () => {
    expect(goldness(243, 237, 227)).toBe(0); // cream paper
    expect(goldness(200, 87, 74)).toBe(0); // berry red
    expect(goldness(143, 165, 138)).toBe(0); // pine green
    expect(goldness(62, 74, 102)).toBe(0); // night blue
  });
  it("keeps the near-white warm window light out of the foil", () => {
    expect(goldness(249, 222, 141)).toBeLessThan(0.25);
  });
  it("only raises metalness when the bake asks for gold foil", () => {
    const px = new Uint8ClampedArray([201, 164, 92, 255]);
    const plain = bakeSurfacePixels(px, 1, 1, { mask: new Float32Array([1]) });
    const gold = bakeSurfacePixels(px, 1, 1, { mask: new Float32Array([1]), goldFoil: true });
    expect(gold.surface[2]).toBeGreaterThan(plain.surface[2] + 120);
  });
});
