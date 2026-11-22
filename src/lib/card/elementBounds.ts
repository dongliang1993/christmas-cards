import type { Face } from "@/lib/letter/model";
import { CARD_H, CARD_W } from "@/lib/cardConstants";
import { FACE_FRAMES } from "./elementLayout";
import type { FaceBox } from "./slots";

/**
 * The whole page an element may sit on, in its face's fractions. The right
 * face is the letter sheet, centred on the card's right panel: its page runs
 * past the sheet to the panel's edges.
 */
export const PAGE_BOX: Record<Face, FaceBox> = (() => {
  const sheet = FACE_FRAMES["inside-right"];
  const mx = (CARD_W - sheet.width) / 2 / sheet.width;
  const my = (CARD_H - sheet.height) / 2 / sheet.height;
  return {
    "inside-left": { x0: 0, y0: 0, x1: 1, y1: 1 },
    "inside-right": { x0: -mx, y0: -my, x1: 1 + mx, y1: 1 + my },
  };
})();

/** An element's size at scale 1: a fraction of its face's width, and width/height. */
export interface ElementShape {
  widthFraction: number;
  aspect: number;
}

interface Vec {
  x: number;
  y: number;
}

/**
 * Half the element's axis-aligned box, turned by `rotation`, as fractions of
 * its face (x of the width, y of the height).
 */
export function halfExtent(face: Face, shape: ElementShape, scale: number, rotation: number): Vec {
  const f = FACE_FRAMES[face];
  const w = f.width * shape.widthFraction * scale;
  const h = w / shape.aspect;
  const c = Math.abs(Math.cos(rotation));
  const s = Math.abs(Math.sin(rotation));
  return { x: (w * c + h * s) / 2 / f.width, y: (w * s + h * c) / 2 / f.height };
}

const UNIT: FaceBox = { x0: 0, y0: 0, x1: 1, y1: 1 };

function fit(v: number, half: number, lo: number, hi: number): number {
  return lo + half > hi - half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, v));
}

/** Move a centre so the whole element stays inside `box`: nothing rides the fold. */
export function keepOnFace(at: Vec, half: Vec, box: FaceBox = UNIT): Vec {
  return { x: fit(at.x, half.x, box.x0, box.x1), y: fit(at.y, half.y, box.y0, box.y1) };
}

/** Scale is relative to the face's width; keep the real size across pages. */
export function scaleAcross(scale: number, from: Face, to: Face): number {
  return from === to ? scale : (scale * FACE_FRAMES[from].width) / FACE_FRAMES[to].width;
}

/** A face-fraction offset, re-expressed on another face at the same paper distance. */
export function shiftAcross(d: Vec, from: Face, to: Face): Vec {
  if (from === to) return d;
  const a = FACE_FRAMES[from];
  const b = FACE_FRAMES[to];
  return { x: (d.x * a.width) / b.width, y: (d.y * a.height) / b.height };
}

/** Before an element has loaded its size is unknown: keep just its centre on the page. */
const POINT: ElementShape = { widthFraction: 0, aspect: 1 };

interface Placed {
  face: Face;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/** A scale/turn/move patch, with the centre nudged so the result stays on its page. */
export function settle<P extends Partial<Pick<Placed, "x" | "y" | "scale" | "rotation">>>(
  el: Placed,
  shape: ElementShape | null,
  patch: P,
): P & Vec {
  const half = halfExtent(el.face, shape ?? POINT, patch.scale ?? el.scale, patch.rotation ?? el.rotation);
  return { ...patch, ...keepOnFace({ x: patch.x ?? el.x, y: patch.y ?? el.y }, half, PAGE_BOX[el.face]) };
}
