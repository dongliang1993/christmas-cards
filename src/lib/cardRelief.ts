/**
 * DOM side of the relief bake: read pixels from an image or canvas, run the
 * pure bake in reliefCore, and hand back canvases three.js can texture from.
 */
import { bakeSurfacePixels, paperNormalTilePixels, type BakeOptions } from "./reliefCore";

/** Anything we can draw into a 2D canvas and that knows its own size. */
export type SurfaceSource = HTMLImageElement | HTMLCanvasElement;

export interface CoverSurface {
  /** Tangent-space normal map. */
  normal: HTMLCanvasElement;
  /** G = roughness, B = metalness (three.js channel convention). */
  surface: HTMLCanvasElement;
}

export function toCanvas(pixels: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.putImageData(new ImageData(pixels, w, h), 0, 0);
  return canvas;
}

export function readPixels(img: SurfaceSource, w: number, h: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable: cannot bake card relief");
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

/** Tileable cold-press paper normal map for the plain sheets. */
export function buildPaperNormalTile(size = 512, bumps = 24): HTMLCanvasElement {
  return toCanvas(paperNormalTilePixels(size, bumps), size, size);
}

/**
 * Bake normal and roughness/metalness maps from a painted sheet (cover art
 * or a page's sticker layer), at the source's own resolution.
 */
export function buildSurface(source: SurfaceSource, relief = 1, opts: Omit<BakeOptions, "relief"> = {}): CoverSurface {
  const w = source.width;
  const h = source.height;
  const baked = bakeSurfacePixels(readPixels(source, w, h), w, h, { ...opts, relief });
  return { normal: toCanvas(baked.normal, w, h), surface: toCanvas(baked.surface, w, h) };
}
