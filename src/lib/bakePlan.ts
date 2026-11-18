import { CARD_ASSETS } from "./cardAssets";
import {
  baseSurfaceKey,
  coverSurfaceKey,
  layerSurfaceKey,
  leftStickersKey,
  sheetStickersKey,
  snowMaskKey,
} from "./bakeKeys";
import type { CardTemplateId } from "./types";

/** Bake a raised piece at about 1.5x the size it shows on the cover: plenty, and quick. */
export const LAYER_BAKE_SCALE = 1.5;

/**
 * One surface a card needs, described independently of where it gets baked
 * (main thread, worker, or a prebaked asset). `name` is the asset file stem;
 * `key` is the surface-cache key (see bakeKeys). Card-dependent tasks carry
 * the card id and the worker reads the rest from CARD_ASSETS; a layer bake
 * depends only on its source and width, so it carries those directly.
 */
export type BakeTask =
  | { kind: "cover"; name: "cover"; key: string; card: CardTemplateId }
  | { kind: "snow"; name: "snow-mask"; key: string; card: CardTemplateId }
  | { kind: "left-stickers"; name: "left"; key: string; card: CardTemplateId }
  | { kind: "sheet-stickers"; name: "sheet"; key: string; card: CardTemplateId }
  | { kind: "base"; name: "base"; key: string; card: CardTemplateId }
  | { kind: "layer"; name: string; key: string; src: string; width: number };

/** Every surface a card needs, deduplicated by cache key. */
export function bakePlanForCard(id: CardTemplateId): BakeTask[] {
  const tasks: BakeTask[] = [
    { kind: "cover", name: "cover", key: coverSurfaceKey(id), card: id },
    { kind: "snow", name: "snow-mask", key: snowMaskKey(id), card: id },
    { kind: "left-stickers", name: "left", key: leftStickersKey(id), card: id },
    { kind: "sheet-stickers", name: "sheet", key: sheetStickersKey(id), card: id },
  ];
  const layers = CARD_ASSETS[id].layers;
  if (layers) {
    tasks.push({ kind: "base", name: "base", key: baseSurfaceKey(id), card: id });
    for (const it of layers.items) {
      const width = it.box[2] * LAYER_BAKE_SCALE;
      tasks.push({ kind: "layer", name: `layer-${it.id}`, key: layerSurfaceKey(it.src, width), src: it.src, width });
    }
  }
  const seen = new Set<string>();
  return tasks.filter((t) => {
    if (seen.has(t.key)) return false;
    seen.add(t.key);
    return true;
  });
}
