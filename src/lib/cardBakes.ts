import { CARD_ASSETS } from "./cardAssets";
import { LAYER_BAKE_SCALE } from "./bakePlan";
import {
  baseSurfaceKey,
  coverSurfaceKey,
  layerSurfaceKey,
  leftStickersKey,
  sheetStickersKey,
  snowMaskKey,
} from "./bakeKeys";
import { rememberImage } from "./imageRegistry";
import { loadImageOnce } from "./gpuImages";
import { buildSurface, readPixels, toCanvas, type CoverSurface, type SurfaceImage } from "./cardRelief";
import { alphaMask, bakeSurfacePixels } from "./reliefCore";
import { createInsideLeftCanvas, createInsideRightSheetCanvas, createSnowMaskCanvas } from "./cardTextures";
import { cachedSurface } from "./surfaceCache";
import type { CardTemplateId } from "./types";

/**
 * Everything about a card that depends only on its artwork, baked once per
 * page. Baking is main-thread work in the hundreds of milliseconds; doing it
 * while a card flies in is what made appearing and switching stutter. The
 * reference builds every card up front and only switches visibility
 * (docs/references/bubbbly-christmas-cards.md), so we do the same: bake on
 * first use, cache, and prebake the other cards while the page is idle.
 */
export interface CardBakes {
  cover: CoverSurface;
  snowMask: SurfaceImage;
  leftStickers: CoverSurface;
  sheetStickers: CoverSurface;
}

const images = new Map<string, Promise<HTMLImageElement>>();

export function loadCoverImage(src: string): Promise<HTMLImageElement> {
  const hit = images.get(src);
  if (hit) return hit;
  const p = loadImageOnce(src).then((img) => {
    rememberImage(src, img);
    return img;
  });
  images.set(src, p);
  // A failed load may be retried later.
  p.catch(() => images.delete(src));
  return p;
}

const coversDone = new Map<CardTemplateId, CoverSurface>();
const coverWaiters = new Map<CardTemplateId, Set<(surface: CoverSurface) => void>>();

/**
 * Call `cb` once card `id`'s cover relief exists: now if it is baked, else
 * when the card or the idle prebake gets to it. Never bakes by itself, so a
 * caller can't stall a frame. Returns an unsubscribe.
 */
export function whenCoverBaked(id: CardTemplateId, cb: (surface: CoverSurface) => void): () => void {
  const done = coversDone.get(id);
  if (done) {
    cb(done);
    return () => undefined;
  }
  const set = coverWaiters.get(id) ?? new Set();
  set.add(cb);
  coverWaiters.set(id, set);
  return () => set.delete(cb);
}

/**
 * Record that a card's cover relief exists (whoever baked it: the runtime
 * step, the worker, or a prebaked asset) and wake the hand's stand-ins.
 */
export function fulfillCover(id: CardTemplateId, surface: CoverSurface): void {
  if (coversDone.has(id)) return;
  coversDone.set(id, surface);
  for (const cb of coverWaiters.get(id) ?? []) cb(surface);
  coverWaiters.delete(id);
}

/** Each bake on its own, cached by card, so they can be spread over idle slots. */
export const BAKE_STEPS: ReadonlyArray<(id: CardTemplateId, img: HTMLImageElement) => unknown> = [
  (id, img) => {
    // Template relief values were tuned for the old baker at 3.2.
    const relief = CARD_ASSETS[id].relief / 3.2;
    const goldFoil = Boolean(CARD_ASSETS[id].goldFoil);
    const tooth = CARD_ASSETS[id].paperTooth ?? 1;
    const surface = cachedSurface(coverSurfaceKey(id), () =>
      buildSurface(img, relief, { goldFoil, tooth }),
    );
    fulfillCover(id, surface);
    return surface;
  },
  (id, img) => {
    const spec = CARD_ASSETS[id];
    return cachedSurface(snowMaskKey(id), () => createSnowMaskCanvas(img, spec.snowArea, spec.w, spec.h));
  },
  (id, img) =>
    cachedSurface(leftStickersKey(id), () =>
      buildSurface(createInsideLeftCanvas(id, img, CARD_ASSETS[id].motifs.left, true)),
    ),
  (id, img) =>
    cachedSurface(sheetStickersKey(id), () =>
      buildSurface(createInsideRightSheetCanvas(id, "", "", img, CARD_ASSETS[id].motifs.insert, true)),
    ),
];

/** Cover relief, snow mask and the inside stickers' relief for one card. */
export function cardBakes(templateId: CardTemplateId, coverImg: HTMLImageElement): CardBakes {
  const [cover, snowMask, leftStickers, sheetStickers] = BAKE_STEPS.map((step) => step(templateId, coverImg));
  return {
    cover: cover as CoverSurface,
    snowMask: snowMask as HTMLCanvasElement,
    leftStickers: leftStickers as CoverSurface,
    sheetStickers: sheetStickers as CoverSurface,
  };
}

/* ── Layered (paper-cut) covers ── */

/** The base sheet under a layered cover's raised pieces. */
export function baseSurface(templateId: CardTemplateId, baseImg: HTMLImageElement): CoverSurface {
  const spec = CARD_ASSETS[templateId];
  const relief = spec.relief / 3.2;
  const tooth = spec.paperTooth ?? 1;
  return cachedSurface(baseSurfaceKey(templateId), () =>
    buildSurface(baseImg, relief, { goldFoil: Boolean(spec.goldFoil), tooth }),
  );
}

/** Bake a raised piece at about 1.5x the size it shows on the cover: plenty, and quick. */
export { LAYER_BAKE_SCALE };

/**
 * Relief and gold foil for one raised paper piece, from its own alpha (only
 * the piece is raised). Baked at `width` px wide.
 */
export function layerSurface(src: string, img: HTMLImageElement, width: number): CoverSurface {
  return cachedSurface(layerSurfaceKey(src, width), () => {
    const w = Math.max(8, Math.min(1024, Math.round(width)));
    const h = Math.max(8, Math.round((w * img.height) / img.width));
    const px = readPixels(img, w, h) as Uint8ClampedArray<ArrayBuffer>;
    const baked = bakeSurfacePixels(px, w, h, { mask: alphaMask(px, w, h), material: "paint", goldFoil: true });
    return { normal: toCanvas(baked.normal, w, h), surface: toCanvas(baked.surface, w, h) };
  });
}

/** Load a layered cover's base and pieces (each piece paired with its spec). */
export function loadLayers(templateId: CardTemplateId) {
  const layers = CARD_ASSETS[templateId].layers;
  if (!layers) return Promise.resolve(null);
  return Promise.all([
    loadCoverImage(layers.base),
    Promise.all(layers.items.map((it) => loadCoverImage(it.src).then((img) => ({ spec: it, img })))),
  ]).then(([base, items]) => ({ base, items }));
}
