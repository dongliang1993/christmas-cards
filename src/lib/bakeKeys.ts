import { CARD_ASSETS } from "./cardAssets";
import type { CardTemplateId } from "./types";

/**
 * The cache-key contract between the runtime bakers (cardBakes), the prebaked
 * asset manifest and the bake worker. Everyone derives keys through these
 * functions, so a prebaked asset counts only when it matches exactly what the
 * runtime would compute — and changing a bake parameter (relief, tooth)
 * changes the key, making stale assets miss automatically.
 */

/** Template relief values were tuned for the old baker at 3.2. */
function scaledRelief(id: CardTemplateId): number {
  return CARD_ASSETS[id].relief / 3.2;
}

function tooth(id: CardTemplateId): number {
  return CARD_ASSETS[id].paperTooth ?? 1;
}

export function coverSurfaceKey(id: CardTemplateId): string {
  return `${CARD_ASSETS[id].coverSrc}|${scaledRelief(id)}|${tooth(id)}`;
}

export function snowMaskKey(id: CardTemplateId): string {
  return `snow|${id}`;
}

export function leftStickersKey(id: CardTemplateId): string {
  return `left-stickers|${id}`;
}

export function sheetStickersKey(id: CardTemplateId): string {
  return `sheet-stickers|${id}`;
}

export function baseSurfaceKey(id: CardTemplateId): string {
  return `base|${id}|${scaledRelief(id)}|${tooth(id)}`;
}

/** `width` is the requested bake width, verbatim (before clamping/rounding). */
export function layerSurfaceKey(src: string, width: number): string {
  return `layer|${src}|${width}`;
}
