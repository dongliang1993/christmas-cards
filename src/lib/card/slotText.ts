import type { TextSlot } from "@/lib/letter/model";
import { SLOTS } from "./slots";

/** A slot's type never shrinks below this share of its starting size (spec §6.1). */
export const SLOT_MIN_SCALE = 0.6;
const SCALE_STEP = 0.05;
export const SLOT_LINE_HEIGHT = 1.35;

/** Starting font size of each slot, as a fraction of the face's height. */
export const SLOT_FONT_FRACTION: Record<TextSlot, number> = {
  greeting: 0.058,
  body: 0.05,
  signature: 0.052,
};

export interface SlotTextOptions {
  /** Width of `line` in em: the font set at size 1. */
  measure(line: string): number;
  /** The face's width / height. */
  faceAspect: number;
}

export interface SlotTextLayout {
  lines: string[];
  /** Share of the slot's starting font size the lines are drawn at. */
  fontScale: number;
  /** True when even the smallest size cannot hold everything. */
  overflow: boolean;
}

/** Wrap points: a CJK character stands alone, other text breaks between words. */
function tokens(paragraph: string): string[] {
  return paragraph.match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+|\s+/g) ?? [];
}

/** Break one word that is wider than the line by characters. */
function splitLong(word: string, maxEm: number, measure: (s: string) => number): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const ch of word) {
    if (cur && measure(cur + ch) > maxEm) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function wrapParagraph(paragraph: string, maxEm: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const tok of tokens(paragraph)) {
    if (/^\s+$/.test(tok)) {
      if (cur) cur += tok;
      continue;
    }
    const pieces = measure(tok) > maxEm ? splitLong(tok, maxEm, measure) : [tok];
    for (const piece of pieces) {
      if (cur && measure((cur + piece).trimEnd()) > maxEm) {
        lines.push(cur.trimEnd());
        cur = piece;
      } else cur += piece;
    }
  }
  lines.push(cur.trimEnd());
  return lines;
}

function wrap(text: string, maxEm: number, measure: (s: string) => number): string[] {
  const lines = text.split(/\r?\n/).flatMap((p) => wrapParagraph(p, maxEm, measure));
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Fit a slot's text into its box: the body wraps, every slot shrinks step by
 * step down to SLOT_MIN_SCALE, and what still does not fit is reported.
 */
export function layoutSlotText(text: string, slot: TextSlot, { measure, faceAspect }: SlotTextOptions): SlotTextLayout {
  const { box, multiline } = SLOTS[slot];
  const boxW = (box.x1 - box.x0) * faceAspect;
  const boxH = box.y1 - box.y0;
  let last: SlotTextLayout | null = null;
  for (let scale = 1; scale >= SLOT_MIN_SCALE - 1e-9; scale -= SCALE_STEP) {
    const fontScale = Math.round(scale * 100) / 100;
    const fontH = SLOT_FONT_FRACTION[slot] * fontScale;
    const maxEm = boxW / fontH;
    const lines = multiline ? wrap(text, maxEm, measure) : [text.replace(/\r?\n/g, " ")];
    const widest = Math.max(0, ...lines.map(measure));
    const fits = widest <= maxEm + 1e-9 && lines.length * fontH * SLOT_LINE_HEIGHT <= boxH + 1e-9;
    last = { lines, fontScale, overflow: !fits };
    if (fits) return last;
  }
  return { ...(last as SlotTextLayout), fontScale: SLOT_MIN_SCALE };
}
