/** The card has two pages: the cover, then the inside spread (spec §13.3). */
export const PAGES = ["cover", "inside"] as const;
export type PageId = (typeof PAGES)[number];

const LABELS: Record<PageId, string> = { cover: "封面", inside: "内页" };

export function pageLabel(page: PageId): string {
  return `${LABELS[page]} · ${PAGES.indexOf(page) + 1}/${PAGES.length}`;
}

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2;
const ZOOM_STEP = 0.2;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function stepZoom(z: number, dir: 1 | -1): number {
  return clampZoom(Math.round((z + dir * ZOOM_STEP) * 10) / 10);
}
