import { describe, expect, it } from "vitest";
import { BITMAP_OPTIONS, decodeImages } from "./gpuImages";

class FakeImg {
  constructor(readonly name: string) {}
}
const isImage = (s: unknown): s is FakeImg => s instanceof FakeImg;

describe("decodeImages: decode <img> sources off the main thread before upload", () => {
  it("decodes each distinct image once, flipped, with no colour or alpha conversion", async () => {
    const a = new FakeImg("a");
    const b = new FakeImg("b");
    const canvas = { width: 4, height: 4 };
    const calls: Array<[FakeImg, ImageBitmapOptions | undefined]> = [];
    const decode = async (img: FakeImg, opts?: ImageBitmapOptions) => {
      calls.push([img, opts]);
      return { bitmapOf: img.name } as unknown as ImageBitmap;
    };

    const out = await decodeImages([a, canvas, b, a, null], { isImage, decode });

    expect(calls.map(([img]) => img)).toEqual([a, b]);
    expect(calls[0][1]).toEqual(BITMAP_OPTIONS);
    expect(out.get(a)).toEqual({ bitmapOf: "a" });
    expect(out.get(b)).toEqual({ bitmapOf: "b" });
    expect(out.has(canvas)).toBe(false);
  });

  it("leaves an image out when it fails to decode, so it uploads as before", async () => {
    const good = new FakeImg("good");
    const bad = new FakeImg("bad");
    const decode = async (img: FakeImg) => {
      if (img === bad) throw new Error("decode failed");
      return { ok: true } as unknown as ImageBitmap;
    };

    const out = await decodeImages([good, bad], { isImage, decode });

    expect(out.has(good)).toBe(true);
    expect(out.has(bad)).toBe(false);
  });
});
