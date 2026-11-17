import type { FontId, Ink } from "@/lib/letter/model";
import { splitTextLines } from "./elementLayout";

/** Rendering resolution: px per line of text. */
const FONT_PX = 96;
const LINE_HEIGHT = 1.35;
const PAD = 24;

/** CSS variables next/font defines in app/layout.tsx; serif uses system faces. */
const FONT_VARS: Record<FontId, string | null> = {
  "hand-en": "--font-caveat",
  "hand-zh": "--font-hand-zh",
  serif: null,
};
const FALLBACK: Record<FontId, string> = {
  "hand-en": '"Caveat", cursive',
  "hand-zh": '"Kaiti SC", "STKaiti", cursive',
  serif: 'Georgia, "Songti SC", "STSong", serif',
};

export const INK_COLORS: Record<Ink, string> = {
  black: "#2b2623",
  red: "#a8322c",
  gold: "#c9a24a",
};

export function fontFamily(font: FontId): string {
  const cssVar = FONT_VARS[font];
  if (cssVar && typeof document !== "undefined") {
    const family = getComputedStyle(document.body).getPropertyValue(cssVar).trim();
    if (family) return `${family}, ${FALLBACK[font]}`;
  }
  return FALLBACK[font];
}

export interface TextImage {
  canvas: HTMLCanvasElement;
  /** width / height */
  aspect: number;
  lineCount: number;
}

/**
 * Draw a text element into a transparent canvas, centred line by line.
 * Waits for the web font so the first frame is not drawn in a fallback face.
 */
export async function renderTextImage(text: string, font: FontId, ink: Ink): Promise<TextImage> {
  const family = fontFamily(font);
  const spec = `500 ${FONT_PX}px ${family}`;
  try {
    await document.fonts.load(spec, text);
  } catch {
    /* draw with whatever face is available */
  }
  const lines = splitTextLines(text);
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("2D canvas unavailable: cannot draw text");
  measure.font = spec;
  const widest = Math.max(FONT_PX, ...lines.map((l) => measure.measureText(l).width));

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(widest + PAD * 2);
  canvas.height = Math.ceil(lines.length * FONT_PX * LINE_HEIGHT + PAD * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable: cannot draw text");
  ctx.font = spec;
  ctx.fillStyle = INK_COLORS[ink];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, PAD + (i + 0.5) * FONT_PX * LINE_HEIGHT);
  });
  return { canvas, aspect: canvas.width / canvas.height, lineCount: lines.length };
}

/** One line of text is this fraction of its face's height at scale 1. */
export const TEXT_LINE_FRACTION = 0.052;
