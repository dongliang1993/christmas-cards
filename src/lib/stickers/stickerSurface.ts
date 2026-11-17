import { readPixels, toCanvas } from "@/lib/cardRelief";
import { alphaMask, bakeSurfacePixels } from "@/lib/reliefCore";
import { parseStickerManifest, type StickerEntry, type StickerManifest } from "./stickerManifest";

/** Stickers are baked at this size: plenty for ~1/4 of a card face. */
const BAKE_SIZE = 512;

export interface StickerSurface {
  entry: StickerEntry;
  /** Colour, with the sticker's transparency. */
  image: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  /** G = roughness, B = metalness. */
  surface: HTMLCanvasElement;
  /** width / height of the opaque artwork's canvas. */
  aspect: number;
}

const cache = new Map<string, Promise<StickerSurface>>();
let manifestPromise: Promise<StickerManifest> | null = null;

export function loadStickerManifest(set = "winter"): Promise<StickerManifest> {
  manifestPromise ??= fetch(`/assets/stickers/${set}/manifest.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`贴纸清单加载失败 (${res.status})`);
      return res.json();
    })
    .then(parseStickerManifest)
    .catch((error: unknown) => {
      manifestPromise = null; // let a later call retry
      throw error;
    });
  return manifestPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`贴纸图片加载失败: ${src}`));
    img.src = src;
  });
}

async function bake(entry: StickerEntry): Promise<StickerSurface> {
  const img = await loadImage(entry.src);
  const scale = BAKE_SIZE / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const px = readPixels(img, w, h);
  const baked = bakeSurfacePixels(px, w, h, { mask: alphaMask(px, w, h), material: entry.material });
  return {
    entry,
    image: toCanvas(new Uint8ClampedArray(px), w, h),
    normal: toCanvas(baked.normal, w, h),
    surface: toCanvas(baked.surface, w, h),
    aspect: w / h,
  };
}

/** Bake once per sticker and share the result between every placement. */
export function loadStickerSurface(entry: StickerEntry): Promise<StickerSurface> {
  const hit = cache.get(entry.id);
  if (hit) return hit;
  const pending = bake(entry).catch((error: unknown) => {
    cache.delete(entry.id);
    throw error;
  });
  cache.set(entry.id, pending);
  return pending;
}
