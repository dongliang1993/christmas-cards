import { CARD_ASSETS } from "@/lib/cardAssets";
import {
  baseSurfaceKey,
  coverSurfaceKey,
  layerSurfaceKey,
  leftStickersKey,
  sheetStickersKey,
  snowMaskKey,
} from "@/lib/bakeKeys";
import { bakePlanForCard, LAYER_BAKE_SCALE, type BakeTask } from "@/lib/bakePlan";
import { baseSurface, cardBakes, layerSurface, loadCoverImage, loadLayers } from "@/lib/cardBakes";
import type { SurfaceImage } from "@/lib/cardRelief";
import type { CardTemplateId } from "@/lib/types";

/**
 * /dev/bake's pipeline: run the exact functions the runtime would call, collect
 * the surfaces by their cache key, encode them as webp and POST them to the
 * dev-only writer. Prebaked assets therefore match the runtime bake pixel for
 * pixel.
 */
export interface BakedEntry {
  task: BakeTask;
  normal?: SurfaceImage;
  surface?: SurfaceImage;
  image?: SurfaceImage;
}

export async function bakeCardEntries(id: CardTemplateId): Promise<BakedEntry[]> {
  const spec = CARD_ASSETS[id];
  const coverImg = await loadCoverImage(spec.coverSrc);
  const layered = await loadLayers(id);
  const bakes = cardBakes(id, coverImg);

  const byKey = new Map<string, { normal?: SurfaceImage; surface?: SurfaceImage; image?: SurfaceImage }>();
  byKey.set(coverSurfaceKey(id), bakes.cover);
  byKey.set(snowMaskKey(id), { image: bakes.snowMask });
  byKey.set(leftStickersKey(id), bakes.leftStickers);
  byKey.set(sheetStickersKey(id), bakes.sheetStickers);
  if (layered) {
    byKey.set(baseSurfaceKey(id), baseSurface(id, layered.base));
    for (const { spec: it, img } of layered.items) {
      byKey.set(
        layerSurfaceKey(it.src, it.box[2] * LAYER_BAKE_SCALE),
        layerSurface(it.src, img, it.box[2] * LAYER_BAKE_SCALE),
      );
    }
  }

  return bakePlanForCard(id).map((task) => {
    const value = byKey.get(task.key);
    if (!value) throw new Error(`bake missing for ${task.key}`);
    return { task, ...value };
  });
}

export function toWebpBlob(source: SurfaceImage, quality = 0.92): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2D canvas unavailable"));
  ctx.drawImage(source, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("webp encode failed"))),
      "image/webp",
      quality,
    );
  });
}

export async function saveCardBakes(
  id: CardTemplateId,
  entries: BakedEntry[],
): Promise<{ directory: string; files: string[] }> {
  const form = new FormData();
  form.set("card", id);
  const manifestEntries: unknown[] = [];
  for (const entry of entries) {
    const name = entry.task.name;
    if (entry.task.kind === "snow") {
      if (!entry.image) throw new Error(`no snow mask for ${name}`);
      form.set(`${name}.webp`, await toWebpBlob(entry.image), `${name}.webp`);
      manifestEntries.push({ key: entry.task.key, name, src: `${name}.webp` });
    } else {
      if (!entry.normal || !entry.surface) throw new Error(`incomplete surface for ${name}`);
      form.set(`${name}-normal.webp`, await toWebpBlob(entry.normal), `${name}-normal.webp`);
      form.set(`${name}-surface.webp`, await toWebpBlob(entry.surface), `${name}-surface.webp`);
      manifestEntries.push({
        key: entry.task.key,
        name,
        normal: `${name}-normal.webp`,
        surface: `${name}-surface.webp`,
      });
    }
  }
  form.set("manifest", JSON.stringify({ version: 1, card: id, entries: manifestEntries }));

  const res = await fetch("/api/dev/bake", { method: "POST", body: form });
  const json = (await res.json()) as { success: boolean; error?: string; data?: { directory: string; files: string[] } };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error ?? `save failed (${res.status})`);
  }
  return json.data;
}
