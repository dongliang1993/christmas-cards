import { CARD_H, CARD_THICKNESS, CARD_W, SHEET_H, SHEET_THICKNESS, SHEET_W } from "@/lib/cardConstants";
import type { Face, Placement } from "@/lib/letter/model";

/**
 * Each editable face, in the local frame of the panel mesh it is drawn on:
 *  - inside-left is the back face of the cover, seen after it swings open,
 *    so the reader's left-to-right runs along the panel's -x (mirrored);
 *  - inside-right is the front of the insert sheet.
 * `surfaceZ` is the panel face; elements sit just outside it.
 */
export const FACE_FRAMES: Record<Face, { width: number; height: number; mirrored: boolean; surfaceZ: number; outward: 1 | -1 }> = {
  "inside-left": { width: CARD_W, height: CARD_H, mirrored: true, surfaceZ: -CARD_THICKNESS / 2, outward: -1 },
  "inside-right": { width: SHEET_W, height: SHEET_H, mirrored: false, surfaceZ: SHEET_THICKNESS / 2, outward: 1 },
};

/** Gap between a face and its lowest element, and between stacked elements. */
const LIFT = 0.0015;
const STACK = 0.0006;

export interface LocalPoint {
  x: number;
  y: number;
  z: number;
}

/** Face-space point (metres, origin top-left as read, v down) → panel local. */
function faceToLocal(face: Face, u: number, v: number, layer: number): LocalPoint {
  const f = FACE_FRAMES[face];
  return {
    x: f.mirrored ? f.width / 2 - u : u - f.width / 2,
    y: f.height / 2 - v,
    z: f.surfaceZ + f.outward * (LIFT + STACK * layer),
  };
}

/** Where a placement's centre lands in its panel's local frame. */
export function placementToLocal(face: Face, x: number, y: number, layer = 0): LocalPoint {
  const f = FACE_FRAMES[face];
  return faceToLocal(face, x * f.width, y * f.height, layer);
}

/** Inverse of placementToLocal: panel-local x/y → 0..1 placement on the face. */
export function localToPlacement(face: Face, lx: number, ly: number): { x: number; y: number } {
  const f = FACE_FRAMES[face];
  const u = f.mirrored ? f.width / 2 - lx : lx + f.width / 2;
  const v = f.height / 2 - ly;
  return { x: u / f.width, y: v / f.height };
}

/**
 * The four corners (top-left, top-right, bottom-right, bottom-left as read)
 * of an element `widthFraction` of its face wide at scale 1, with the given
 * width/height aspect. Positive rotation turns clockwise as the reader sees it.
 */
export function quadCorners(p: Placement, widthFraction: number, aspect: number): LocalPoint[] {
  const f = FACE_FRAMES[p.face];
  const w = f.width * widthFraction * p.scale;
  const h = w / aspect;
  const cu = p.x * f.width;
  const cv = p.y * f.height;
  const c = Math.cos(p.rotation);
  const s = Math.sin(p.rotation);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([du, dv]) => faceToLocal(p.face, cu + du * c - dv * s, cv + du * s + dv * c, p.z));
}

/** Lines of a text element, without trailing blank lines (at least one). */
export function splitTextLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  while (lines.length > 1 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}
